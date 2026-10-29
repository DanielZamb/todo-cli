import XCTest

@MainActor
final class MenuBarFlowTests: XCTestCase {
    func testMenuBarQuickAdd() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "local.todo.Todo")
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let config = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: root.appendingPathComponent("DerivedData/verification.json")))
        let appearance = config["captureAppearance"] ?? "system"
        let taskTitle = try XCTUnwrap(config["captureTaskTitle"])
        app.launchEnvironment["TODO_MACOS_CONFIG"] = root.appendingPathComponent("DerivedData/verification.json").path
        app.launchEnvironment["TODO_VERIFY_KEYCHAIN_NO_UI"] = "1"
        app.launchEnvironment["TODO_VERIFY_KEYCHAIN_FAILURE"] = root.appendingPathComponent("DerivedData/keychain-failure.json").path
        app.launchArguments = ["--server", try XCTUnwrap(config["server"]), "--profile", "work", "--keychain-service", try XCTUnwrap(config["keychainService"])]
        if appearance == "light" || appearance == "dark" {
            app.launchArguments += ["-AppleInterfaceStyle", appearance.capitalized]
        }
        app.launch()
        defer { app.terminate() }
        let passphrase = app.secureTextFields["passphrase"]
        XCTAssertTrue(passphrase.waitForExistence(timeout: 10))
        passphrase.click()
        passphrase.typeText("scratch verification passphrase")
        app.buttons["sign-in"].click()
        let newTask = app.buttons["new-task"]
        XCTAssertTrue(newTask.waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        XCTAssertTrue(newTask.waitForExistence(timeout: 10))
        XCTAssertFalse(passphrase.exists)
        capture("session-restored-" + appearance, app.windows["tasks"])
        attach("menu-bar-ax", app.debugDescription)
        let extra = app.statusItems.firstMatch
        XCTAssertTrue(extra.waitForExistence(timeout: 5))
        app.typeKey("n", modifierFlags: [.command, .option])
        let title = app.textFields["new-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.click()
        title.typeText(taskTitle + " tomorrow p1")
        let due = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Clear Due ")).firstMatch
        XCTAssertTrue(due.waitForExistence(timeout: 5))
        due.click()
        XCTAssertFalse(due.exists)
        capture("menu-bar-ready-\(appearance)", app.dialogs.firstMatch)
        title.click()
        app.typeKey(.return, modifierFlags: [])
        let submitted = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false OR value == %@", ""), object: title)
        XCTAssertEqual(XCTWaiter.wait(for: [submitted], timeout: 10), .completed)
        let receipt = try JSONSerialization.data(withJSONObject: ["passed": true, "surface": "MenuBarExtra", "title": taskTitle, "priority": "P1", "dueChipCleared": true])
        attach("menu-bar-ui", try XCTUnwrap(String(data: receipt, encoding: .utf8)))
        let window = app.windows["tasks"]
        app.staticTexts["view-today"].click()
        capture("today-ready-\(appearance)", window)
        app.buttons["new-task"].click()
        let input = app.textFields["new-title"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.click()
        input.typeText("Prepare launch notes tomorrow p1 #writing @Website")
        XCTAssertTrue(app.buttons["Clear Website"].waitForExistence(timeout: 5))
        capture("quick-add-ready-\(appearance)", window)
        app.buttons["Close quick add"].click()
        let task = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Review launch plan,")).firstMatch
        XCTAssertTrue(task.waitForExistence(timeout: 5))
        task.click()
        XCTAssertTrue(app.buttons["date-due"].waitForExistence(timeout: 5))
        capture("editor-ready-\(appearance)", window)
        app.buttons["date-due"].click()
        XCTAssertTrue(app.datePickers.firstMatch.waitForExistence(timeout: 5))
        capture("date-picker-ready-\(appearance)", window)
        app.typeKey(.escape, modifierFlags: [])
        app.buttons["Close"].click()
        for view in ["overdue", "scheduled", "inbox"] {
            app.staticTexts["view-" + view].click()
            capture(view + "-ready-" + appearance, window)
        }
    }

    private func attach(_ name: String, _ value: String) {
        let attachment = XCTAttachment(string: value)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func capture(_ name: String, _ element: XCUIElement) {
        let screenshot = XCTAttachment(screenshot: element.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        attach(name + "-ax", element.debugDescription)
    }

}
