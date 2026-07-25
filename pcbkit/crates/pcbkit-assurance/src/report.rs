use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CheckItem {
    pub name: String,
    pub passed: bool,
    pub details: String,
}

impl CheckItem {
    pub fn pass(name: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            passed: true,
            details: details.into(),
        }
    }
    pub fn fail(name: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            passed: false,
            details: details.into(),
        }
    }
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct CheckReport {
    pub checks: Vec<CheckItem>,
}

impl CheckReport {
    pub fn push(&mut self, item: CheckItem) {
        self.checks.push(item);
    }
    pub fn extend(&mut self, items: Vec<CheckItem>) {
        self.checks.extend(items);
    }
    pub fn passed(&self) -> bool {
        self.checks.iter().all(|c| c.passed)
    }
    pub fn print(&self) {
        for c in &self.checks {
            println!(
                "{} {}{}",
                if c.passed { "PASS" } else { "FAIL" },
                c.name,
                if c.details.is_empty() {
                    String::new()
                } else {
                    format!(" — {}", c.details)
                }
            );
        }
    }
}
