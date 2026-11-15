"""Rule registry with auto-discovery of the built-in `rules` package."""
from __future__ import annotations

import importlib
import pkgutil
from typing import TypeVar

from .base import AlertRule

R = TypeVar("R", bound=type[AlertRule])


class RuleRegistry:
    def __init__(self) -> None:
        self._rules: dict[str, AlertRule] = {}

    def register(self, rule: AlertRule) -> None:
        self._rules[rule.rule_id] = rule

    def unregister(self, rule_id: str) -> None:
        self._rules.pop(rule_id, None)

    def rules(self) -> list[AlertRule]:
        return list(self._rules.values())

    def get(self, rule_id: str) -> AlertRule | None:
        return self._rules.get(rule_id)


default_registry = RuleRegistry()


def register_rule(cls: R) -> R:
    """Class decorator: instantiate the rule and add it to the default registry."""
    default_registry.register(cls())
    return cls


def load_builtin_rules() -> RuleRegistry:
    """Import every module in `domain.alerts.rules` so decorators run."""
    from . import rules as rules_pkg

    for module in pkgutil.iter_modules(rules_pkg.__path__):
        importlib.import_module(f"{rules_pkg.__name__}.{module.name}")
    return default_registry
