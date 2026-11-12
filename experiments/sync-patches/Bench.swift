import Foundation

struct TaskTime: Codable { let kind: String; let date: String?; let utc: String?; let time_zone: String? }
struct Attachment: Codable { let id: String; let kind: String; let url: String?; let path: String?; let label: String?; let added_at: String }
struct Occurrence: Codable { let series_id: String; let date: String? }
struct TaskRow: Codable { let id: String; let profile_id: String; let entity_version: Int; let row_version: Int; let title: String; let description: String?; let status: String; let project_id: String?; let priority: String; let scheduled_at: TaskTime?; let due_at: TaskTime?; let energy: Int?; let estimate_min: Int?; let source: String; let tags: [String]; let occurrence: Occurrence?; let created_at: String; let updated_at: String; let completed_at: String?; let deleted_at: String?; let attachments: [Attachment]?; let external_id: String? }
struct Energy: Codable { let energy: Double; let unweighted: Int }
struct Computed: Codable { let ready: Bool; let blocked: Bool; let depends_on: [String]; let blocks: [String]; let remaining_energy: Energy }
indirect enum JSON: Codable { case object([String:JSON]), array([JSON]), string(String), number(Double), bool(Bool), null
 init(from decoder: Decoder) throws { let c=try decoder.singleValueContainer(); if c.decodeNil(){self = .null} else if let v=try? c.decode(Bool.self){self = .bool(v)} else if let v=try? c.decode(Double.self){self = .number(v)} else if let v=try? c.decode(String.self){self = .string(v)} else if let v=try? c.decode([String:JSON].self){self = .object(v)} else {self = .array(try c.decode([JSON].self))} }
 func encode(to encoder: Encoder) throws {var c=encoder.singleValueContainer(); switch self {case .object(let v):try c.encode(v);case .array(let v):try c.encode(v);case .string(let v):try c.encode(v);case .number(let v):try c.encode(v);case .bool(let v):try c.encode(v);case .null:try c.encodeNil()}}
}
struct Replica: Codable { let profile:String; let generation:String; var cursor:String; var profiles:[JSON]; var projects:[JSON]; var tags:[JSON]; var series:[JSON]; var rows:[String:TaskRow]; var computed:[String:Computed]; var lists:[String:[String]] }
struct Insert: Codable {let index:Int;let id:String}
struct Edits: Codable {let remove:[Int];let insert:[Insert]}
struct Patch: Codable {let from:String;let to:String;let generation:String;let mode:String;let rows:[String:TaskRow];let remove:[String];let computed:[String:Computed];let remove_computed:[String];let lists:[String:[String]];let edits:[String:Edits];let profiles:[JSON]?;let projects:[JSON]?;let tags:[JSON]?;let series:[JSON]?}
struct Sample: Decodable {let kind:String;let before:Replica;let after:Replica;let whole:Patch;let edits:Patch}
struct Frame: Decodable {let committed:Double;let patch:Patch}
func apply(_ r:inout Replica,_ p:Patch) {precondition(r.cursor==p.from && r.generation==p.generation);for(k,v)in p.rows{r.rows[k]=v};for k in p.remove{r.rows.removeValue(forKey:k)};for(k,v)in p.computed{r.computed[k]=v};for k in p.remove_computed{r.computed.removeValue(forKey:k)};for(k,v)in p.lists{r.lists[k]=v};for(k,e)in p.edits{var ids=r.lists[k] ?? [];for i in e.remove{ids.remove(at:i)};for v in e.insert{ids.insert(v.id,at:v.index)};r.lists[k]=ids};if let v=p.profiles{r.profiles=v};if let v=p.projects{r.projects=v};if let v=p.tags{r.tags=v};if let v=p.series{r.series=v};r.cursor=p.to}
func stamp()->Double{Date().timeIntervalSince1970*1000}
func mono()->Double{Double(DispatchTime.now().uptimeNanoseconds)/1e6}
@main struct Bench {
 static func main() async throws {
  let args=CommandLine.arguments,decoder=JSONDecoder(),encoder=JSONEncoder()
  if args[1]=="list" {
   struct List:Decodable{let tasks:[TaskRow]}
   let data=try Data(contentsOf:URL(fileURLWithPath:args[2]));var times:[Double]=[];for _ in 0..<5{for i in 0..<110{let t=mono();let value=try decoder.decode(List.self,from:data);if i>=10{times.append(mono()-t)};precondition(value.tasks.count==60)}};print(String(data:try encoder.encode(times),encoding:.utf8)!)
  } else if args[1]=="codec" {
   let samples=try decoder.decode([Sample].self,from:Data(contentsOf:URL(fileURLWithPath:args[2])));var result:[[String:JSON]]=[]
   for pair in 0..<5 {for s in (pair%2==0 ? samples:Array(samples.reversed())){for kind in (pair%2==0 ? ["baseline","whole","edits"]:["edits","whole","baseline"]){let data=try kind=="baseline" ? encoder.encode(s.after):encoder.encode(kind=="whole" ? s.whole:s.edits);var dec:[Double]=[],app:[Double]=[];for i in 0..<110 {var r=s.before;let t=mono();if kind=="baseline" {r=try decoder.decode(Replica.self,from:data)}else{let p=try decoder.decode(Patch.self,from:data);let d=mono();apply(&r,p);if i>=10{dec.append(d-t);app.append(mono()-d)}};if kind=="baseline" && i>=10{dec.append(mono()-t);app.append(0)};precondition(r.cursor==s.after.cursor && r.rows.count==s.after.rows.count && r.lists==s.after.lists)};result.append(["pair":.number(Double(pair)),"operation":.string(s.kind),"kind":.string(kind),"bytes":.number(Double(data.count)),"decode":.array(dec.map{.number($0)}),"apply":.array(app.map{.number($0)})])}}}
   print(String(data:try encoder.encode(result),encoding:.utf8)!)
  } else {
   let base=URL(string:args[2])!,transport=args[1],session=URLSession(configuration:.ephemeral)
   let (data,_)=try await session.data(from:base.appendingPathComponent("baseline"));var replica=try decoder.decode(Replica.self,from:data);var values:[Double]=[]
   if transport=="ws" {let url=URL(string:base.absoluteString.replacingOccurrences(of:"http:",with:"ws:")+"ws")!;let task=session.webSocketTask(with:url);task.resume();_ = try await task.receive();for _ in 0..<100{async let drive=session.data(from:base.appendingPathComponent("drive"));let message=try await task.receive();let d:Data;switch message {case .string(let s):d=Data(s.utf8);case .data(let v):d=v;@unknown default:fatalError()};let f=try decoder.decode(Frame.self,from:d);apply(&replica,f.patch);values.append(stamp()-f.committed);_ = try await drive};task.cancel(with:.normalClosure,reason:nil)
   }else{let (bytes,_)=try await session.bytes(from:base.appendingPathComponent("events"));var lines=bytes.lines.makeAsyncIterator();for _ in 0..<100{async let drive=session.data(from:base.appendingPathComponent("drive"));while let line=try await lines.next(){if line.hasPrefix("data: "){let f=try decoder.decode(Frame.self,from:Data(line.dropFirst(6).utf8));apply(&replica,f.patch);values.append(stamp()-f.committed);break}};_ = try await drive}}
   print(String(data:try encoder.encode(values),encoding:.utf8)!);session.invalidateAndCancel()
  }
 }
}
