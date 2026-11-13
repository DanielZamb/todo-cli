from pathlib import Path
import re
import xml.etree.ElementTree as ET

def read_results(xml, logfile):
    xml = Path(xml)
    log = Path(logfile).read_text()
    outcomes, files = [], []
    for framework, file in [('XCTest', xml), ('SwiftTesting', xml.with_stem(xml.stem + '-swift-testing'))]:
        if file.exists():
            files.append(str(file))
            for case in ET.parse(file).getroot().iter('testcase'):
                outcomes.append({'id': framework + '/' + case.attrib.get('classname', '') + '/' + case.attrib['name'], 'outcome': 'failed' if case.find('failure') is not None or case.find('error') is not None else 'skipped' if case.find('skipped') is not None else 'passed'})
    if not any(row['id'].startswith('XCTest/') for row in outcomes):
        for identity, outcome in re.findall(r"^Test Case '-\[([^\]]+)\]' (passed|failed|skipped)", log, re.MULTILINE):
            outcomes.append({'id': 'XCTest/' + identity.replace(' ', '/', 1), 'outcome': outcome})
    xctest = re.findall(r'Executed (\d+) tests?', log)
    testing = re.findall(r'Test run with (\d+) tests?', log)
    expected = {'XCTest': int(xctest[-1]) if xctest else 0, 'SwiftTesting': int(testing[-1]) if testing else 0}
    if not xctest and not testing:
        raise RuntimeError('No completed test framework summary')
    if any(row['id'].startswith('SwiftTesting/') for row in outcomes) and not testing:
        raise RuntimeError('No completed Swift Testing summary')
    if any(row['id'].startswith('XCTest/') for row in outcomes) and not xctest:
        raise RuntimeError('No completed XCTest summary')
    for framework, minimum in expected.items():
        if sum(row['id'].startswith(framework + '/') for row in outcomes) < minimum:
            raise RuntimeError('Structured results omitted reported tests: ' + framework)
    return {'outcomes': outcomes, 'XMLFiles': files, 'minimumReportedTests': expected}
