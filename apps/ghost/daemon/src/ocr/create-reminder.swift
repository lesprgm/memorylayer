import EventKit

// 1. Parse arguments
// Usage: create-reminder <title> <notes> <due-date-iso?>
guard CommandLine.arguments.count > 2 else {
    print("Usage: create-reminder <title> <notes> [due-date-iso]")
    exit(1)
}

let title = CommandLine.arguments[1]
let notes = CommandLine.arguments[2]
let dueDateString = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : nil

let store = EKEventStore()

// 2. Request access
store.requestAccess(to: .reminder) { (granted, error) in
    if !granted {
        print("Error: Access to Reminders denied")
        exit(1)
    }
    
    if let error = error {
        print("Error: \(error.localizedDescription)")
        exit(1)
    }
    
    // 3. Create reminder
    let reminder = EKReminder(eventStore: store)
    reminder.title = title
    reminder.notes = notes
    reminder.calendar = store.defaultCalendarForNewReminders()
    
    // 4. Set due date if provided
    if let dateString = dueDateString {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: dateString) {
            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
            reminder.dueDateComponents = components
            reminder.addAlarm(EKAlarm(absoluteDate: date))
        }
    }
    
    // 5. Save
    do {
        try store.save(reminder, commit: true)
        print("Success: Created reminder '\(title)'")
        exit(0)
    } catch {
        print("Error: Failed to save reminder - \(error.localizedDescription)")
        exit(1)
    }
}

// Keep run loop alive for async requestAccess
RunLoop.main.run()
