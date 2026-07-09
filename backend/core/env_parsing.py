def empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def csv_to_tuple(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())


def parse_bool(value: str | None, *, default: bool) -> bool:
    normalized = empty_to_none(value)
    if normalized is None:
        return default
    return normalized.lower() in {"1", "true", "yes", "on"}
