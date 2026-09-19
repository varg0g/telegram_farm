# Схема базы данных SQLite (`backend/data/crm.db`)

### Таблица: `accounts`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | INTEGER | 0 | None | 1 |
| 1 | `phone` | TEXT | 0 | None | 0 |
| 2 | `session_name` | TEXT | 1 | None | 0 |
| 3 | `first_name` | TEXT | 0 | '' | 0 |
| 4 | `last_name` | TEXT | 0 | '' | 0 |
| 5 | `username` | TEXT | 0 | '' | 0 |
| 6 | `user_id` | INTEGER | 0 | 0 | 0 |
| 7 | `work_group_id` | INTEGER | 0 | None | 0 |
| 8 | `proxy_id` | INTEGER | 0 | None | 0 |
| 9 | `status` | TEXT | 0 | 'offline' | 0 |
| 10 | `status_detail` | TEXT | 0 | '' | 0 |
| 11 | `floodwait_until` | INTEGER | 0 | 0 | 0 |
| 12 | `device_fingerprint` | TEXT | 0 | None | 0 |
| 13 | `created_at` | INTEGER | 0 | None | 0 |
| 14 | `last_active_at` | INTEGER | 0 | None | 0 |

### Таблица: `background_tasks`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | TEXT | 0 | None | 1 |
| 1 | `task_type` | TEXT | 1 | None | 0 |
| 2 | `title` | TEXT | 0 | '' | 0 |
| 3 | `status` | TEXT | 0 | 'pending' | 0 |
| 4 | `progress` | INTEGER | 0 | 0 | 0 |
| 5 | `total` | INTEGER | 0 | 0 | 0 |
| 6 | `processed` | INTEGER | 0 | 0 | 0 |
| 7 | `log` | TEXT | 0 | '' | 0 |
| 8 | `account_phones` | TEXT | 0 | None | 0 |
| 9 | `config_json` | TEXT | 0 | None | 0 |
| 10 | `state_json` | TEXT | 0 | None | 0 |
| 11 | `created_at` | INTEGER | 0 | None | 0 |
| 12 | `updated_at` | INTEGER | 0 | None | 0 |

### Таблица: `dialogs`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `account_phone` | TEXT | 1 | None | 1 |
| 1 | `chat_id` | INTEGER | 1 | None | 2 |
| 2 | `chat_type` | TEXT | 0 | 'user' | 0 |
| 3 | `title` | TEXT | 0 | '' | 0 |
| 4 | `username` | TEXT | 0 | '' | 0 |
| 5 | `top_message_text` | TEXT | 0 | '' | 0 |
| 6 | `top_message_date` | INTEGER | 0 | 0 | 0 |
| 7 | `unread_count` | INTEGER | 0 | 0 | 0 |
| 8 | `is_pinned` | BOOLEAN | 0 | 0 | 0 |
| 9 | `is_archived` | BOOLEAN | 0 | 0 | 0 |
| 10 | `avatar_path` | TEXT | 0 | '' | 0 |
| 11 | `updated_at` | INTEGER | 0 | 0 | 0 |
| 12 | `read_outbox_max_id` | INTEGER | 0 | 0 | 0 |
| 13 | `top_message_id` | INTEGER | 0 | 0 | 0 |
| 14 | `top_message_is_outgoing` | BOOLEAN | 0 | 0 | 0 |

### Таблица: `lead_groups`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | INTEGER | 0 | None | 1 |
| 1 | `name` | TEXT | 1 | None | 0 |
| 2 | `color` | TEXT | 0 | '#3b82f6' | 0 |
| 3 | `created_at` | INTEGER | 0 | None | 0 |

### Таблица: `leads`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `chat_id` | INTEGER | 0 | None | 1 |
| 1 | `account_phone` | TEXT | 0 | None | 0 |
| 2 | `first_name` | TEXT | 0 | '' | 0 |
| 3 | `last_name` | TEXT | 0 | '' | 0 |
| 4 | `username` | TEXT | 0 | '' | 0 |
| 5 | `phone` | TEXT | 0 | '' | 0 |
| 6 | `bio` | TEXT | 0 | '' | 0 |
| 7 | `birthday` | TEXT | 0 | '' | 0 |
| 8 | `channel_link` | TEXT | 0 | '' | 0 |
| 9 | `notes` | TEXT | 0 | '' | 0 |
| 10 | `lead_group_ids` | TEXT | 0 | '' | 0 |
| 11 | `updated_at` | INTEGER | 0 | None | 0 |
| 12 | `channel_title` | TEXT | 0 | '' | 0 |

### Таблица: `leomatch_matches`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | INTEGER | 0 | None | 1 |
| 1 | `account_phone` | TEXT | 1 | None | 0 |
| 2 | `lead_user_id` | INTEGER | 0 | None | 0 |
| 3 | `lead_username` | TEXT | 0 | '' | 0 |
| 4 | `lead_name` | TEXT | 0 | '' | 0 |
| 5 | `lead_age` | INTEGER | 0 | 0 | 0 |
| 6 | `lead_city` | TEXT | 0 | '' | 0 |
| 7 | `lead_bio` | TEXT | 0 | '' | 0 |
| 8 | `avatar_path` | TEXT | 0 | '' | 0 |
| 9 | `raw_message` | TEXT | 0 | '' | 0 |
| 10 | `status` | TEXT | 0 | 'new' | 0 |
| 11 | `created_at` | INTEGER | 1 | None | 0 |

### Таблица: `messages`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | INTEGER | 0 | None | 1 |
| 1 | `account_phone` | TEXT | 1 | None | 0 |
| 2 | `chat_id` | INTEGER | 1 | None | 0 |
| 3 | `message_id` | INTEGER | 1 | None | 0 |
| 4 | `sender_id` | INTEGER | 0 | None | 0 |
| 5 | `sender_name` | TEXT | 0 | '' | 0 |
| 6 | `text` | TEXT | 0 | '' | 0 |
| 7 | `date` | INTEGER | 1 | None | 0 |
| 8 | `is_outgoing` | BOOLEAN | 1 | None | 0 |
| 9 | `is_read` | BOOLEAN | 0 | 0 | 0 |
| 10 | `media_type` | TEXT | 0 | None | 0 |
| 11 | `media_path` | TEXT | 0 | None | 0 |
| 12 | `media_metadata` | TEXT | 0 | None | 0 |
| 13 | `reply_to_msg_id` | INTEGER | 0 | None | 0 |
| 14 | `reactions_json` | TEXT | 0 | None | 0 |
| 15 | `buttons_json` | TEXT | 0 | None | 0 |
| 16 | `raw_json` | TEXT | 0 | None | 0 |

### Таблица: `proxies`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | INTEGER | 0 | None | 1 |
| 1 | `proxy_group_id` | INTEGER | 0 | None | 0 |
| 2 | `proto` | TEXT | 0 | 'socks5' | 0 |
| 3 | `host` | TEXT | 1 | None | 0 |
| 4 | `port` | INTEGER | 1 | None | 0 |
| 5 | `username` | TEXT | 0 | None | 0 |
| 6 | `password` | TEXT | 0 | None | 0 |
| 7 | `status` | TEXT | 0 | 'unknown' | 0 |
| 8 | `ping_ms` | INTEGER | 0 | 0 | 0 |
| 9 | `last_checked_at` | INTEGER | 0 | 0 | 0 |

### Таблица: `proxy_groups`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | INTEGER | 0 | None | 1 |
| 1 | `title` | TEXT | 1 | None | 0 |
| 2 | `created_at` | INTEGER | 0 | None | 0 |

### Таблица: `quick_replies`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | INTEGER | 0 | None | 1 |
| 1 | `title` | TEXT | 1 | None | 0 |
| 2 | `category` | TEXT | 0 | 'Общее' | 0 |
| 3 | `reply_type` | TEXT | 0 | 'text' | 0 |
| 4 | `content_text` | TEXT | 0 | '' | 0 |
| 5 | `file_path` | TEXT | 0 | '' | 0 |
| 6 | `duration` | INTEGER | 0 | 0 | 0 |
| 7 | `created_at` | INTEGER | 1 | None | 0 |

### Таблица: `work_groups`
| № | Колонка | Тип | NotNull | Default | PK |
|---|---|---|---|---|---|
| 0 | `id` | INTEGER | 0 | None | 1 |
| 1 | `title` | TEXT | 1 | None | 0 |
| 2 | `color` | TEXT | 0 | '#6366f1' | 0 |
| 3 | `created_at` | INTEGER | 0 | None | 0 |
