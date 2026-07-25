use crate::report::CheckItem;
use pcbkit_core::Result;
use serde::Deserialize;
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct BringupChecklist {
    #[serde(default)]
    pub steps: Vec<BringupStep>,
}

#[derive(Debug, Deserialize)]
pub struct BringupStep {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub required_before_fab: bool,
    #[serde(default)]
    pub signed: bool,
}

pub fn load_bringup(path: &Path) -> Result<BringupChecklist> {
    let text = std::fs::read_to_string(path)?;
    Ok(toml::from_str(&text)?)
}

impl BringupChecklist {
    pub fn validate(&self) -> Vec<CheckItem> {
        let mut items = Vec::new();
        let required_ids = [
            "flash_mcu",
            "pd_12v",
            "port_current_sense",
            "status_leds",
        ];
        let have: HashSet<_> = self.steps.iter().map(|s| s.id.as_str()).collect();
        for id in required_ids {
            items.push(if have.contains(id) {
                let title = self
                    .steps
                    .iter()
                    .find(|s| s.id == id)
                    .map(|s| s.title.as_str())
                    .unwrap_or("");
                CheckItem::pass(format!("bring-up step `{id}` present"), title)
            } else {
                CheckItem::fail(format!("bring-up step `{id}` present"), "missing")
            });
        }
        items.push(CheckItem {
            name: "bring-up checklist non-empty".into(),
            passed: !self.steps.is_empty(),
            details: format!("{} steps", self.steps.len()),
        });
        let unsigned: Vec<_> = self
            .steps
            .iter()
            .filter(|s| s.required_before_fab && !s.signed)
            .map(|s| s.id.as_str())
            .collect();
        items.push(CheckItem {
            name: "bring-up fab-required steps signed".into(),
            passed: unsigned.is_empty(),
            details: if unsigned.is_empty() {
                "ok".into()
            } else {
                format!("unsigned: {}", unsigned.join(", "))
            },
        });
        items
    }
}
