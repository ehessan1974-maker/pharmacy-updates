# -*- coding: utf-8 -*-
"""db_adapters — نظام المحوّل الموحّد لقواعد بيانات أبوتيكا."""
from .base import BaseAdapter, DBError
from .sqlite_adapter import SqliteAdapter
from .txtjson_adapter import TxtJsonAdapter
from .csv_adapter import CsvAdapter
from .excel_adapter import ExcelAdapter
from .access_adapter import AccessAdapter, AccessSimAdapter
from .network_adapter import NetworkAdapter
from .proxy import ProxyAdapter
from . import factory, migrate

__all__ = [
    "BaseAdapter", "DBError",
    "SqliteAdapter", "TxtJsonAdapter", "CsvAdapter", "ExcelAdapter",
    "AccessAdapter", "AccessSimAdapter", "NetworkAdapter", "ProxyAdapter",
    "factory", "migrate",
]
