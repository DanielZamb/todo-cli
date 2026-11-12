import AppKit
import CoreGraphics
@main struct InputCoverageProbe {
 @MainActor static func main() {
 do { try VerificationProbeScope.install(); try VerificationDefaults.install() }
 catch { FileHandle.standardError.write(Data((error.localizedDescription+"\n").utf8)); exit(78) }
 let app=NSApplication.shared
 app.setActivationPolicy(.prohibited)
 let timer=OwnerIdle.monitor(interruptionRequest:URL(fileURLWithPath:CommandLine.arguments[1]))
 let kind:CGEventType=CommandLine.arguments[2]=="modifier" ? .flagsChanged : .keyDown
 let observer=NSEvent.addLocalMonitorForEvents(matching:.any) { event in
  FileHandle.standardError.write(Data(("own event delivered type "+String(event.type.rawValue)+"\n").utf8));return event
 }
 DispatchQueue.main.asyncAfter(deadline:.now()+0.2) {
 let event=CGEvent(keyboardEventSource:CGEventSource(stateID:.privateState),virtualKey:56,keyDown:true)!
 event.type=kind
 event.setIntegerValueField(.eventSourceUserData,value:OwnerIdle.testInputTag)
 app.postEvent(NSEvent(cgEvent:event)!,atStart:false)
 }
 DispatchQueue.main.asyncAfter(deadline:.now()+1) { exit(1) }
 withExtendedLifetime((timer,observer)) {app.run()}
 exit(1)
 }
}
