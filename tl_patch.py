from io import BytesIO
from typing import Optional, Any, List
import pyrogram.raw.all as raw_all
from pyrogram.raw.core import TLObject
from pyrogram.raw.core.primitives import Int, Long, String, Bool, Vector, Double

TLObject.__bool__ = lambda self: True

class Birthday(TLObject):
    ID = 0x6c8e1e06
    QUALNAME = "types.Birthday"
    __slots__ = ["day", "month", "year"]

    def __init__(self, *, day: int, month: int, year: Optional[int] = None):
        self.day = day
        self.month = month
        self.year = year

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "Birthday":
        flags = Int.read(b)
        day = Int.read(b)
        month = Int.read(b)
        year = Int.read(b) if (flags & (1 << 0)) else None
        return Birthday(day=day, month=month, year=year)

    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 1 if self.year is not None else 0
        b.write(Int(flags))
        b.write(Int(self.day))
        b.write(Int(self.month))
        if self.year is not None:
            b.write(Int(self.year))
        return b.getvalue()


class UserFull178(TLObject):
    ID = 0xcc997720
    QUALNAME = "types.UserFull"
    __slots__ = [
        "id", "settings", "notify_settings", "common_chats_count",
        "blocked", "phone_calls_available", "phone_calls_private",
        "can_pin_message", "has_scheduled", "video_calls_available",
        "voice_messages_forbidden", "translations_disabled",
        "stories_pinned_available", "blocked_my_stories_from",
        "wallpaper_overridden", "contact_require_premium",
        "read_dates_private", "sponsored_enabled",
        "about", "personal_photo", "profile_photo", "fallback_photo", "bot_info",
        "pinned_msg_id", "folder_id", "ttl_period", "theme_emoticon",
        "private_forward_name", "bot_group_admin_rights", "bot_broadcast_admin_rights",
        "premium_gifts", "wallpaper", "stories",
        "business_work_hours", "business_location", "business_greeting_message",
        "business_away_message", "business_intro",
        "birthday", "personal_channel_id", "personal_channel_message"
    ]

    def __init__(self, **kwargs):
        for k in self.__slots__:
            setattr(self, k, kwargs.get(k))

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "UserFull178":
        flags = Int.read(b)
        flags2 = Int.read(b)

        blocked = bool(flags & (1 << 0))
        phone_calls_available = bool(flags & (1 << 4))
        phone_calls_private = bool(flags & (1 << 5))
        can_pin_message = bool(flags & (1 << 7))
        has_scheduled = bool(flags & (1 << 12))
        video_calls_available = bool(flags & (1 << 13))
        voice_messages_forbidden = bool(flags & (1 << 20))
        translations_disabled = bool(flags & (1 << 23))
        stories_pinned_available = bool(flags & (1 << 26))
        blocked_my_stories_from = bool(flags & (1 << 27))
        wallpaper_overridden = bool(flags & (1 << 28))
        contact_require_premium = bool(flags & (1 << 29))
        read_dates_private = bool(flags & (1 << 30))

        sponsored_enabled = bool(flags2 & (1 << 7))

        id = Long.read(b)
        about = String.read(b) if (flags & (1 << 1)) else None
        settings = TLObject.read(b)

        personal_photo = TLObject.read(b) if (flags & (1 << 21)) else None
        profile_photo = TLObject.read(b) if (flags & (1 << 2)) else None
        fallback_photo = TLObject.read(b) if (flags & (1 << 22)) else None
        notify_settings = TLObject.read(b)
        bot_info = TLObject.read(b) if (flags & (1 << 3)) else None
        pinned_msg_id = Int.read(b) if (flags & (1 << 6)) else None
        common_chats_count = Int.read(b)
        folder_id = Int.read(b) if (flags & (1 << 11)) else None
        ttl_period = Int.read(b) if (flags & (1 << 14)) else None
        theme_emoticon = String.read(b) if (flags & (1 << 15)) else None
        private_forward_name = String.read(b) if (flags & (1 << 16)) else None
        bot_group_admin_rights = TLObject.read(b) if (flags & (1 << 17)) else None
        bot_broadcast_admin_rights = TLObject.read(b) if (flags & (1 << 18)) else None
        premium_gifts = TLObject.read(b) if (flags & (1 << 19)) else []
        wallpaper = TLObject.read(b) if (flags & (1 << 24)) else None

        stories = TLObject.read(b) if (flags & (1 << 25)) else None
        business_work_hours = TLObject.read(b) if (flags2 & (1 << 0)) else None
        business_location = TLObject.read(b) if (flags2 & (1 << 1)) else None
        business_greeting_message = TLObject.read(b) if (flags2 & (1 << 2)) else None
        business_away_message = TLObject.read(b) if (flags2 & (1 << 3)) else None
        business_intro = TLObject.read(b) if (flags2 & (1 << 4)) else None

        birthday = TLObject.read(b) if (flags2 & (1 << 5)) else None

        if flags2 & (1 << 6):
            personal_channel_id = Long.read(b)
            personal_channel_message = Int.read(b)
        else:
            personal_channel_id = None
            personal_channel_message = None

        return UserFull178(
            id=id, settings=settings, notify_settings=notify_settings,
            common_chats_count=common_chats_count, blocked=blocked,
            phone_calls_available=phone_calls_available, phone_calls_private=phone_calls_private,
            can_pin_message=can_pin_message, has_scheduled=has_scheduled,
            video_calls_available=video_calls_available, voice_messages_forbidden=voice_messages_forbidden,
            translations_disabled=translations_disabled, stories_pinned_available=stories_pinned_available,
            blocked_my_stories_from=blocked_my_stories_from, wallpaper_overridden=wallpaper_overridden,
            contact_require_premium=contact_require_premium, read_dates_private=read_dates_private,
            sponsored_enabled=sponsored_enabled, about=about,
            personal_photo=personal_photo, profile_photo=profile_photo, fallback_photo=fallback_photo,
            bot_info=bot_info, pinned_msg_id=pinned_msg_id, folder_id=folder_id,
            ttl_period=ttl_period, theme_emoticon=theme_emoticon, private_forward_name=private_forward_name,
            bot_group_admin_rights=bot_group_admin_rights, bot_broadcast_admin_rights=bot_broadcast_admin_rights,
            premium_gifts=premium_gifts, wallpaper=wallpaper, stories=stories,
            business_work_hours=business_work_hours, business_location=business_location,
            business_greeting_message=business_greeting_message, business_away_message=business_away_message,
            business_intro=business_intro, birthday=birthday,
            personal_channel_id=personal_channel_id, personal_channel_message=personal_channel_message
        )


class PeerSettings178(TLObject):
    ID = 0xacd66c5e
    QUALNAME = "types.PeerSettings"
    __slots__ = [
        "report_spam", "add_contact", "block_contact", "share_contact",
        "need_contacts_exception", "report_geo", "autoarchived", "invite_members",
        "request_chat_broadcast", "business_bot_paused", "business_bot_can_reply",
        "geo_distance", "request_chat_title", "request_chat_date",
        "business_bot_id", "business_bot_manage_url"
    ]

    def __init__(self, **kwargs):
        for k in self.__slots__:
            setattr(self, k, kwargs.get(k))

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "PeerSettings178":
        flags = Int.read(b)
        report_spam = bool(flags & (1 << 0))
        add_contact = bool(flags & (1 << 1))
        block_contact = bool(flags & (1 << 2))
        share_contact = bool(flags & (1 << 3))
        need_contacts_exception = bool(flags & (1 << 4))
        report_geo = bool(flags & (1 << 5))
        autoarchived = bool(flags & (1 << 7))
        invite_members = bool(flags & (1 << 8))
        request_chat_broadcast = bool(flags & (1 << 10))
        business_bot_paused = bool(flags & (1 << 11))
        business_bot_can_reply = bool(flags & (1 << 12))

        geo_distance = Int.read(b) if (flags & (1 << 6)) else None
        request_chat_title = String.read(b) if (flags & (1 << 9)) else None
        request_chat_date = Int.read(b) if (flags & (1 << 9)) else None
        business_bot_id = Long.read(b) if (flags & (1 << 13)) else None
        business_bot_manage_url = String.read(b) if (flags & (1 << 13)) else None

        return PeerSettings178(
            report_spam=report_spam, add_contact=add_contact, block_contact=block_contact,
            share_contact=share_contact, need_contacts_exception=need_contacts_exception,
            report_geo=report_geo, autoarchived=autoarchived, invite_members=invite_members,
            request_chat_broadcast=request_chat_broadcast, business_bot_paused=business_bot_paused,
            business_bot_can_reply=business_bot_can_reply, geo_distance=geo_distance,
            request_chat_title=request_chat_title, request_chat_date=request_chat_date,
            business_bot_id=business_bot_id, business_bot_manage_url=business_bot_manage_url
        )


class Message178(TLObject):
    ID = 0x2357bf25
    QUALNAME = "types.Message"
    __slots__ = [
        "id", "peer_id", "date", "message", "out", "mentioned", "media_unread",
        "silent", "post", "from_scheduled", "legacy", "edit_hide", "pinned",
        "noforwards", "invert_media", "offline", "from_id", "from_boosts_applied",
        "saved_peer_id", "fwd_from", "via_bot_id", "via_business_bot_id", "reply_to",
        "media", "reply_markup", "entities", "views", "forwards", "replies",
        "edit_date", "post_author", "grouped_id", "reactions", "restriction_reason",
        "ttl_period", "quick_reply_shortcut_id"
    ]

    def __init__(self, **kwargs):
        for k in self.__slots__:
            setattr(self, k, kwargs.get(k))

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "Message178":
        flags = Int.read(b)
        out = bool(flags & (1 << 1))
        mentioned = bool(flags & (1 << 4))
        media_unread = bool(flags & (1 << 5))
        silent = bool(flags & (1 << 13))
        post = bool(flags & (1 << 14))
        from_scheduled = bool(flags & (1 << 18))
        legacy = bool(flags & (1 << 19))
        edit_hide = bool(flags & (1 << 21))
        pinned = bool(flags & (1 << 24))
        noforwards = bool(flags & (1 << 26))
        invert_media = bool(flags & (1 << 27))

        flags2 = Int.read(b)
        offline = bool(flags2 & (1 << 1))

        id = Int.read(b)
        from_id = TLObject.read(b) if (flags & (1 << 8)) else None
        from_boosts_applied = Int.read(b) if (flags & (1 << 29)) else None
        peer_id = TLObject.read(b)
        saved_peer_id = TLObject.read(b) if (flags & (1 << 28)) else None
        fwd_from = TLObject.read(b) if (flags & (1 << 2)) else None
        via_bot_id = Long.read(b) if (flags & (1 << 11)) else None
        via_business_bot_id = Long.read(b) if (flags2 & (1 << 0)) else None
        reply_to = TLObject.read(b) if (flags & (1 << 3)) else None
        date = Int.read(b)
        message = String.read(b)
        media = TLObject.read(b) if (flags & (1 << 9)) else None
        reply_markup = TLObject.read(b) if (flags & (1 << 6)) else None
        entities = TLObject.read(b) if (flags & (1 << 7)) else []
        views = Int.read(b) if (flags & (1 << 10)) else None
        forwards = Int.read(b) if (flags & (1 << 10)) else None
        replies = TLObject.read(b) if (flags & (1 << 23)) else None
        edit_date = Int.read(b) if (flags & (1 << 15)) else None
        post_author = String.read(b) if (flags & (1 << 16)) else None
        grouped_id = Long.read(b) if (flags & (1 << 17)) else None
        reactions = TLObject.read(b) if (flags & (1 << 20)) else None
        restriction_reason = TLObject.read(b) if (flags & (1 << 22)) else []
        ttl_period = Int.read(b) if (flags & (1 << 25)) else None
        quick_reply_shortcut_id = Int.read(b) if (flags & (1 << 30)) else None

        return Message178(
            id=id, peer_id=peer_id, date=date, message=message, out=out,
            mentioned=mentioned, media_unread=media_unread, silent=silent,
            post=post, from_scheduled=from_scheduled, legacy=legacy,
            edit_hide=edit_hide, pinned=pinned, noforwards=noforwards,
            invert_media=invert_media, offline=offline, from_id=from_id,
            from_boosts_applied=from_boosts_applied, saved_peer_id=saved_peer_id,
            fwd_from=fwd_from, via_bot_id=via_bot_id,
            via_business_bot_id=via_business_bot_id, reply_to=reply_to,
            media=media, reply_markup=reply_markup, entities=entities,
            views=views, forwards=forwards, replies=replies,
            edit_date=edit_date, post_author=post_author, grouped_id=grouped_id,
            reactions=reactions, restriction_reason=restriction_reason,
            ttl_period=ttl_period, quick_reply_shortcut_id=quick_reply_shortcut_id
        )


class PeerNotifySettings178(TLObject):
    ID = 0x99622c0c
    QUALNAME = "types.PeerNotifySettings"
    __slots__ = [
        "show_previews", "silent", "mute_until", "ios_sound", "android_sound", "other_sound",
        "stories_muted", "stories_hide_sender", "stories_ios_sound", "stories_android_sound", "stories_other_sound"
    ]

    def __init__(self, **kwargs):
        for k in self.__slots__:
            setattr(self, k, kwargs.get(k))

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "PeerNotifySettings178":
        flags = Int.read(b)
        show_previews = Bool.read(b) if (flags & (1 << 0)) else None
        silent = Bool.read(b) if (flags & (1 << 1)) else None
        mute_until = Int.read(b) if (flags & (1 << 2)) else None
        ios_sound = TLObject.read(b) if (flags & (1 << 3)) else None
        android_sound = TLObject.read(b) if (flags & (1 << 4)) else None
        other_sound = TLObject.read(b) if (flags & (1 << 5)) else None
        stories_muted = Bool.read(b) if (flags & (1 << 6)) else None
        stories_hide_sender = Bool.read(b) if (flags & (1 << 7)) else None
        stories_ios_sound = TLObject.read(b) if (flags & (1 << 8)) else None
        stories_android_sound = TLObject.read(b) if (flags & (1 << 9)) else None
        stories_other_sound = TLObject.read(b) if (flags & (1 << 10)) else None

        return PeerNotifySettings178(
            show_previews=show_previews, silent=silent, mute_until=mute_until,
            ios_sound=ios_sound, android_sound=android_sound, other_sound=other_sound,
            stories_muted=stories_muted, stories_hide_sender=stories_hide_sender,
            stories_ios_sound=stories_ios_sound, stories_android_sound=stories_android_sound,
            stories_other_sound=stories_other_sound
        )


class Channel178(TLObject):
    ID = 0x0aadfc8f
    QUALNAME = "types.Channel"
    __slots__ = [
        "id", "title", "photo", "date", "creator", "left", "broadcast", "verified",
        "megagroup", "restricted", "signatures", "min", "scam", "has_link",
        "has_geo", "slowmode_enabled", "call_active", "call_not_empty", "fake",
        "gigagroup", "noforwards", "join_to_send", "join_request", "forum",
        "stories_hidden", "stories_hidden_min", "stories_unavailable",
        "access_hash", "username", "restriction_reason", "admin_rights",
        "banned_rights", "default_banned_rights", "participants_count",
        "usernames", "stories_max_id", "color", "profile_color", "emoji_status", "level"
    ]

    def __init__(self, **kwargs):
        for k in self.__slots__:
            setattr(self, k, kwargs.get(k))

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "Channel178":
        flags = Int.read(b)
        creator = bool(flags & (1 << 0))
        left = bool(flags & (1 << 2))
        broadcast = bool(flags & (1 << 5))
        verified = bool(flags & (1 << 7))
        megagroup = bool(flags & (1 << 8))
        restricted = bool(flags & (1 << 9))
        signatures = bool(flags & (1 << 11))
        min = bool(flags & (1 << 12))
        scam = bool(flags & (1 << 19))
        has_link = bool(flags & (1 << 20))
        has_geo = bool(flags & (1 << 21))
        slowmode_enabled = bool(flags & (1 << 22))
        call_active = bool(flags & (1 << 23))
        call_not_empty = bool(flags & (1 << 24))
        fake = bool(flags & (1 << 25))
        gigagroup = bool(flags & (1 << 26))
        noforwards = bool(flags & (1 << 27))
        join_to_send = bool(flags & (1 << 28))
        join_request = bool(flags & (1 << 29))
        forum = bool(flags & (1 << 30))

        flags2 = Int.read(b)
        stories_hidden = bool(flags2 & (1 << 1))
        stories_hidden_min = bool(flags2 & (1 << 2))
        stories_unavailable = bool(flags2 & (1 << 3))

        id = Long.read(b)
        access_hash = Long.read(b) if (flags & (1 << 13)) else None
        title = String.read(b)
        username = String.read(b) if (flags & (1 << 6)) else None
        photo = TLObject.read(b)
        date = Int.read(b)
        restriction_reason = TLObject.read(b) if (flags & (1 << 9)) else []
        admin_rights = TLObject.read(b) if (flags & (1 << 14)) else None
        banned_rights = TLObject.read(b) if (flags & (1 << 15)) else None
        default_banned_rights = TLObject.read(b) if (flags & (1 << 18)) else None
        participants_count = Int.read(b) if (flags & (1 << 17)) else None
        usernames = TLObject.read(b) if (flags2 & (1 << 0)) else []
        stories_max_id = Int.read(b) if (flags2 & (1 << 4)) else None
        color = TLObject.read(b) if (flags2 & (1 << 7)) else None
        profile_color = TLObject.read(b) if (flags2 & (1 << 8)) else None
        emoji_status = TLObject.read(b) if (flags2 & (1 << 9)) else None
        level = Int.read(b) if (flags2 & (1 << 10)) else None

        return Channel178(
            id=id, title=title, photo=photo, date=date, creator=creator,
            left=left, broadcast=broadcast, verified=verified, megagroup=megagroup,
            restricted=restricted, signatures=signatures, min=min, scam=scam,
            has_link=has_link, has_geo=has_geo, slowmode_enabled=slowmode_enabled,
            call_active=call_active, call_not_empty=call_not_empty, fake=fake,
            gigagroup=gigagroup, noforwards=noforwards, join_to_send=join_to_send,
            join_request=join_request, forum=forum, stories_hidden=stories_hidden,
            stories_hidden_min=stories_hidden_min, stories_unavailable=stories_unavailable,
            access_hash=access_hash, username=username, restriction_reason=restriction_reason,
            admin_rights=admin_rights, banned_rights=banned_rights,
            default_banned_rights=default_banned_rights,
            participants_count=participants_count, usernames=usernames,
            stories_max_id=stories_max_id, color=color, profile_color=profile_color,
            emoji_status=emoji_status, level=level
        )


class User178(TLObject):
    ID = 0x215c4438
    QUALNAME = "types.User"
    __slots__ = [
        "id", "is_self", "contact", "mutual_contact", "deleted", "bot",
        "bot_chat_history", "bot_nochats", "verified", "restricted", "min",
        "bot_inline_geo", "support", "scam", "apply_min_photo", "fake",
        "bot_attach_menu", "premium", "attach_menu_enabled", "bot_can_edit",
        "close_friend", "stories_hidden", "stories_unavailable",
        "contact_require_premium", "bot_business", "access_hash",
        "first_name", "last_name", "username", "phone", "photo", "status",
        "bot_info_version", "restriction_reason", "bot_inline_placeholder",
        "lang_code", "emoji_status", "usernames", "stories_max_id", "color", "profile_color"
    ]

    def __init__(self, **kwargs):
        for k in self.__slots__:
            setattr(self, k, kwargs.get(k))

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "User178":
        flags = Int.read(b)
        is_self = bool(flags & (1 << 10))
        contact = bool(flags & (1 << 11))
        mutual_contact = bool(flags & (1 << 12))
        deleted = bool(flags & (1 << 13))
        bot = bool(flags & (1 << 14))
        bot_chat_history = bool(flags & (1 << 15))
        bot_nochats = bool(flags & (1 << 16))
        verified = bool(flags & (1 << 17))
        restricted = bool(flags & (1 << 18))
        min = bool(flags & (1 << 20))
        bot_inline_geo = bool(flags & (1 << 21))
        support = bool(flags & (1 << 23))
        scam = bool(flags & (1 << 24))
        apply_min_photo = bool(flags & (1 << 25))
        fake = bool(flags & (1 << 26))
        bot_attach_menu = bool(flags & (1 << 27))
        premium = bool(flags & (1 << 28))
        attach_menu_enabled = bool(flags & (1 << 29))

        flags2 = Int.read(b)
        bot_can_edit = bool(flags2 & (1 << 1))
        close_friend = bool(flags2 & (1 << 2))
        stories_hidden = bool(flags2 & (1 << 3))
        stories_unavailable = bool(flags2 & (1 << 4))
        contact_require_premium = bool(flags2 & (1 << 10))
        bot_business = bool(flags2 & (1 << 11))

        id = Long.read(b)
        access_hash = Long.read(b) if (flags & (1 << 0)) else None
        first_name = String.read(b) if (flags & (1 << 1)) else None
        last_name = String.read(b) if (flags & (1 << 2)) else None
        username = String.read(b) if (flags & (1 << 3)) else None
        phone = String.read(b) if (flags & (1 << 4)) else None
        photo = TLObject.read(b) if (flags & (1 << 5)) else None
        status = TLObject.read(b) if (flags & (1 << 6)) else None
        bot_info_version = Int.read(b) if (flags & (1 << 14)) else None
        restriction_reason = TLObject.read(b) if (flags & (1 << 18)) else []
        bot_inline_placeholder = String.read(b) if (flags & (1 << 19)) else None
        lang_code = String.read(b) if (flags & (1 << 22)) else None
        emoji_status = TLObject.read(b) if (flags & (1 << 30)) else None
        usernames = TLObject.read(b) if (flags2 & (1 << 0)) else []
        stories_max_id = Int.read(b) if (flags2 & (1 << 5)) else None
        color = TLObject.read(b) if (flags2 & (1 << 8)) else None
        profile_color = TLObject.read(b) if (flags2 & (1 << 9)) else None

        return User178(
            id=id, is_self=is_self, contact=contact,
            mutual_contact=mutual_contact, deleted=deleted, bot=bot,
            bot_chat_history=bot_chat_history, bot_nochats=bot_nochats,
            verified=verified, restricted=restricted, min=min,
            bot_inline_geo=bot_inline_geo, support=support, scam=scam,
            apply_min_photo=apply_min_photo, fake=fake,
            bot_attach_menu=bot_attach_menu, premium=premium,
            attach_menu_enabled=attach_menu_enabled,
            bot_can_edit=bot_can_edit, close_friend=close_friend,
            stories_hidden=stories_hidden, stories_unavailable=stories_unavailable,
            contact_require_premium=contact_require_premium, bot_business=bot_business,
            access_hash=access_hash, first_name=first_name, last_name=last_name,
            username=username, phone=phone, photo=photo, status=status,
            bot_info_version=bot_info_version, restriction_reason=restriction_reason,
            bot_inline_placeholder=bot_inline_placeholder, lang_code=lang_code,
            emoji_status=emoji_status, usernames=usernames, stories_max_id=stories_max_id,
            color=color, profile_color=profile_color
        )


class UserStatusRecently178(TLObject):
    ID = 0x7b197dc8
    QUALNAME = "types.UserStatusRecently"
    __slots__ = ["by_me"]
    def __init__(self, by_me=False):
        self.by_me = by_me
    @staticmethod
    def read(b: BytesIO, *args: Any):
        flags = Int.read(b)
        return UserStatusRecently178(by_me=bool(flags & (1 << 0)))


class UserStatusLastWeek178(TLObject):
    ID = 0x541a1d1a
    QUALNAME = "types.UserStatusLastWeek"
    __slots__ = ["by_me"]
    def __init__(self, by_me=False):
        self.by_me = by_me
    @staticmethod
    def read(b: BytesIO, *args: Any):
        flags = Int.read(b)
        return UserStatusLastWeek178(by_me=bool(flags & (1 << 0)))


class UserStatusLastMonth178(TLObject):
    ID = 0x65899777
    QUALNAME = "types.UserStatusLastMonth"
    __slots__ = ["by_me"]
    def __init__(self, by_me=False):
        self.by_me = by_me
    @staticmethod
    def read(b: BytesIO, *args: Any):
        flags = Int.read(b)
        return UserStatusLastMonth178(by_me=bool(flags & (1 << 0)))


class BusinessWeeklyOpen(TLObject):
    ID = 0x120b1ab9
    QUALNAME = "types.BusinessWeeklyOpen"
    __slots__ = ["start_minute", "end_minute"]
    def __init__(self, *, start_minute: int, end_minute: int):
        self.start_minute = start_minute
        self.end_minute = end_minute
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessWeeklyOpen":
        start_minute = Int.read(b)
        end_minute = Int.read(b)
        return BusinessWeeklyOpen(start_minute=start_minute, end_minute=end_minute)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        b.write(Int(self.start_minute))
        b.write(Int(self.end_minute))
        return b.getvalue()


class BusinessWorkHours(TLObject):
    ID = 0x8c92b098
    QUALNAME = "types.BusinessWorkHours"
    __slots__ = ["open_now", "timezone_id", "weekly_open"]
    def __init__(self, *, timezone_id: str, weekly_open: List[BusinessWeeklyOpen], open_now: Optional[bool] = None):
        self.open_now = open_now
        self.timezone_id = timezone_id
        self.weekly_open = weekly_open
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessWorkHours":
        flags = Int.read(b)
        open_now = bool(flags & (1 << 0))
        timezone_id = String.read(b)
        weekly_open = TLObject.read(b)
        return BusinessWorkHours(open_now=open_now, timezone_id=timezone_id, weekly_open=weekly_open)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 1 if self.open_now else 0
        b.write(Int(flags))
        b.write(String(self.timezone_id))
        b.write(Vector(self.weekly_open or []).write())
        return b.getvalue()


class BusinessLocation(TLObject):
    ID = 0xac5c1af7
    QUALNAME = "types.BusinessLocation"
    __slots__ = ["geo_point", "address"]
    def __init__(self, *, address: str, geo_point: Optional[Any] = None):
        self.address = address
        self.geo_point = geo_point
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessLocation":
        flags = Int.read(b)
        geo_point = TLObject.read(b) if (flags & (1 << 0)) else None
        address = String.read(b)
        return BusinessLocation(geo_point=geo_point, address=address)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 1 if self.geo_point is not None else 0
        b.write(Int(flags))
        if self.geo_point is not None:
            b.write(self.geo_point.write())
        b.write(String(self.address))
        return b.getvalue()


class BusinessRecipients(TLObject):
    ID = 0x21108ff7
    QUALNAME = "types.BusinessRecipients"
    __slots__ = ["existing_chats", "new_chats", "contacts", "non_contacts", "exclude_selected", "users"]
    def __init__(self, *, existing_chats: Optional[bool] = None, new_chats: Optional[bool] = None,
                 contacts: Optional[bool] = None, non_contacts: Optional[bool] = None,
                 exclude_selected: Optional[bool] = None, users: Optional[List[int]] = None):
        self.existing_chats = existing_chats
        self.new_chats = new_chats
        self.contacts = contacts
        self.non_contacts = non_contacts
        self.exclude_selected = exclude_selected
        self.users = users
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessRecipients":
        flags = Int.read(b)
        existing_chats = bool(flags & (1 << 0))
        new_chats = bool(flags & (1 << 1))
        contacts = bool(flags & (1 << 2))
        non_contacts = bool(flags & (1 << 3))
        exclude_selected = bool(flags & (1 << 5))
        users = TLObject.read(b, Long) if (flags & (1 << 4)) else None
        return BusinessRecipients(
            existing_chats=existing_chats, new_chats=new_chats, contacts=contacts,
            non_contacts=non_contacts, exclude_selected=exclude_selected, users=users
        )
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 0
        if self.existing_chats: flags |= (1 << 0)
        if self.new_chats: flags |= (1 << 1)
        if self.contacts: flags |= (1 << 2)
        if self.non_contacts: flags |= (1 << 3)
        if self.users is not None: flags |= (1 << 4)
        if self.exclude_selected: flags |= (1 << 5)
        b.write(Int(flags))
        if self.users is not None:
            b.write(Vector(self.users, Long).write())
        return b.getvalue()


class BusinessAwayMessageScheduleAlways(TLObject):
    ID = 0xc9b9e2b9
    QUALNAME = "types.BusinessAwayMessageScheduleAlways"
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessAwayMessageScheduleAlways":
        return BusinessAwayMessageScheduleAlways()
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        return b.getvalue()


class BusinessAwayMessageScheduleOutsideWorkHours(TLObject):
    ID = 0xc3f2f501
    QUALNAME = "types.BusinessAwayMessageScheduleOutsideWorkHours"
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessAwayMessageScheduleOutsideWorkHours":
        return BusinessAwayMessageScheduleOutsideWorkHours()
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        return b.getvalue()


class BusinessAwayMessageScheduleCustom(TLObject):
    ID = 0xcc4d9ecc
    QUALNAME = "types.BusinessAwayMessageScheduleCustom"
    __slots__ = ["start_date", "end_date"]
    def __init__(self, *, start_date: int, end_date: int):
        self.start_date = start_date
        self.end_date = end_date
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessAwayMessageScheduleCustom":
        start_date = Int.read(b)
        end_date = Int.read(b)
        return BusinessAwayMessageScheduleCustom(start_date=start_date, end_date=end_date)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        b.write(Int(self.start_date))
        b.write(Int(self.end_date))
        return b.getvalue()


class BusinessGreetingMessage(TLObject):
    ID = 0xe519abab
    QUALNAME = "types.BusinessGreetingMessage"
    __slots__ = ["shortcut_id", "recipients", "no_activity_days"]
    def __init__(self, *, shortcut_id: int, recipients: Any, no_activity_days: int):
        self.shortcut_id = shortcut_id
        self.recipients = recipients
        self.no_activity_days = no_activity_days
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessGreetingMessage":
        shortcut_id = Int.read(b)
        recipients = TLObject.read(b)
        no_activity_days = Int.read(b)
        return BusinessGreetingMessage(shortcut_id=shortcut_id, recipients=recipients, no_activity_days=no_activity_days)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        b.write(Int(self.shortcut_id))
        b.write(self.recipients.write())
        b.write(Int(self.no_activity_days))
        return b.getvalue()


class BusinessAwayMessage(TLObject):
    ID = 0xef156a5c
    QUALNAME = "types.BusinessAwayMessage"
    __slots__ = ["offline_only", "shortcut_id", "schedule", "recipients"]
    def __init__(self, *, shortcut_id: int, schedule: Any, recipients: Any, offline_only: Optional[bool] = None):
        self.offline_only = offline_only
        self.shortcut_id = shortcut_id
        self.schedule = schedule
        self.recipients = recipients
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessAwayMessage":
        flags = Int.read(b)
        offline_only = bool(flags & (1 << 0))
        shortcut_id = Int.read(b)
        schedule = TLObject.read(b)
        recipients = TLObject.read(b)
        return BusinessAwayMessage(offline_only=offline_only, shortcut_id=shortcut_id, schedule=schedule, recipients=recipients)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 1 if self.offline_only else 0
        b.write(Int(flags))
        b.write(Int(self.shortcut_id))
        b.write(self.schedule.write())
        b.write(self.recipients.write())
        return b.getvalue()


class BusinessIntro(TLObject):
    ID = 0x5a0a066d
    QUALNAME = "types.BusinessIntro"
    __slots__ = ["title", "description", "sticker"]
    def __init__(self, *, title: str, description: str, sticker: Optional[Any] = None):
        self.title = title
        self.description = description
        self.sticker = sticker
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "BusinessIntro":
        flags = Int.read(b)
        title = String.read(b)
        description = String.read(b)
        sticker = TLObject.read(b) if (flags & (1 << 0)) else None
        return BusinessIntro(title=title, description=description, sticker=sticker)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 1 if self.sticker is not None else 0
        b.write(Int(flags))
        b.write(String(self.title))
        b.write(String(self.description))
        if self.sticker is not None:
            b.write(self.sticker.write())
        return b.getvalue()


class PrivacyValueAllowCloseFriends(TLObject):
    ID = 0xf7e8d89b
    QUALNAME = "types.PrivacyValueAllowCloseFriends"
    @staticmethod
    def read(b: BytesIO, *args: Any):
        return PrivacyValueAllowCloseFriends()
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        return b.getvalue()


class PrivacyValueAllowPremium(TLObject):
    ID = 0xece9814b
    QUALNAME = "types.PrivacyValueAllowPremium"
    @staticmethod
    def read(b: BytesIO, *args: Any):
        return PrivacyValueAllowPremium()
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        return b.getvalue()


class MediaAreaCoordinates(TLObject):
    ID = 0x03d1ea4e
    QUALNAME = "types.MediaAreaCoordinates"
    __slots__ = ["x", "y", "w", "h", "rotation"]
    def __init__(self, *, x: float, y: float, w: float, h: float, rotation: float):
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.rotation = rotation
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MediaAreaCoordinates":
        return MediaAreaCoordinates(
            x=Double.read(b), y=Double.read(b), w=Double.read(b), h=Double.read(b), rotation=Double.read(b)
        )
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        b.write(Double(self.x))
        b.write(Double(self.y))
        b.write(Double(self.w))
        b.write(Double(self.h))
        b.write(Double(self.rotation))
        return b.getvalue()


class MediaAreaVenue(TLObject):
    ID = 0xbe82db9c
    QUALNAME = "types.MediaAreaVenue"
    __slots__ = ["coordinates", "geo", "title", "address", "provider", "venue_id", "venue_type"]
    def __init__(self, *, coordinates: Any, geo: Any, title: str, address: str, provider: str, venue_id: str, venue_type: str):
        self.coordinates = coordinates
        self.geo = geo
        self.title = title
        self.address = address
        self.provider = provider
        self.venue_id = venue_id
        self.venue_type = venue_type
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MediaAreaVenue":
        return MediaAreaVenue(
            coordinates=TLObject.read(b), geo=TLObject.read(b), title=String.read(b),
            address=String.read(b), provider=String.read(b), venue_id=String.read(b), venue_type=String.read(b)
        )
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        b.write(self.coordinates.write())
        b.write(self.geo.write())
        b.write(String(self.title))
        b.write(String(self.address))
        b.write(String(self.provider))
        b.write(String(self.venue_id))
        b.write(String(self.venue_type))
        return b.getvalue()


class MediaAreaGeoPoint(TLObject):
    ID = 0xdf8b3b22
    QUALNAME = "types.MediaAreaGeoPoint"
    __slots__ = ["coordinates", "geo"]
    def __init__(self, *, coordinates: Any, geo: Any):
        self.coordinates = coordinates
        self.geo = geo
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MediaAreaGeoPoint":
        return MediaAreaGeoPoint(coordinates=TLObject.read(b), geo=TLObject.read(b))
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        b.write(self.coordinates.write())
        b.write(self.geo.write())
        return b.getvalue()


class MediaAreaSuggestedReaction(TLObject):
    ID = 0x14455871
    QUALNAME = "types.MediaAreaSuggestedReaction"
    __slots__ = ["dark", "flipped", "coordinates", "reaction"]
    def __init__(self, *, coordinates: Any, reaction: Any, dark: Optional[bool] = None, flipped: Optional[bool] = None):
        self.coordinates = coordinates
        self.reaction = reaction
        self.dark = dark
        self.flipped = flipped
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MediaAreaSuggestedReaction":
        flags = Int.read(b)
        dark = bool(flags & (1 << 0))
        flipped = bool(flags & (1 << 1))
        coordinates = TLObject.read(b)
        reaction = TLObject.read(b)
        return MediaAreaSuggestedReaction(dark=dark, flipped=flipped, coordinates=coordinates, reaction=reaction)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 0
        if self.dark: flags |= (1 << 0)
        if self.flipped: flags |= (1 << 1)
        b.write(Int(flags))
        b.write(self.coordinates.write())
        b.write(self.reaction.write())
        return b.getvalue()


class MediaAreaChannelPost(TLObject):
    ID = 0x770416af
    QUALNAME = "types.MediaAreaChannelPost"
    __slots__ = ["coordinates", "channel_id", "msg_id"]
    def __init__(self, *, coordinates: Any, channel_id: int, msg_id: int):
        self.coordinates = coordinates
        self.channel_id = channel_id
        self.msg_id = msg_id
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MediaAreaChannelPost":
        coordinates = TLObject.read(b)
        channel_id = Long.read(b)
        msg_id = Int.read(b)
        return MediaAreaChannelPost(coordinates=coordinates, channel_id=channel_id, msg_id=msg_id)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        b.write(self.coordinates.write())
        b.write(Long(self.channel_id))
        b.write(Int(self.msg_id))
        return b.getvalue()


class StoryFwdHeader(TLObject):
    ID = 0xb826e150
    QUALNAME = "types.StoryFwdHeader"
    __slots__ = ["modified", "from_peer", "from_name", "story_id"]
    def __init__(self, *, modified: Optional[bool] = None, from_peer: Optional[Any] = None, from_name: Optional[str] = None, story_id: Optional[int] = None):
        self.modified = modified
        self.from_peer = from_peer
        self.from_name = from_name
        self.story_id = story_id
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "StoryFwdHeader":
        flags = Int.read(b)
        modified = bool(flags & (1 << 3))
        from_peer = TLObject.read(b) if (flags & (1 << 0)) else None
        from_name = String.read(b) if (flags & (1 << 1)) else None
        story_id = Int.read(b) if (flags & (1 << 2)) else None
        return StoryFwdHeader(modified=modified, from_peer=from_peer, from_name=from_name, story_id=story_id)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 0
        if self.from_peer is not None: flags |= (1 << 0)
        if self.from_name is not None: flags |= (1 << 1)
        if self.story_id is not None: flags |= (1 << 2)
        if self.modified: flags |= (1 << 3)
        b.write(Int(flags))
        if self.from_peer is not None: b.write(self.from_peer.write())
        if self.from_name is not None: b.write(String(self.from_name))
        if self.story_id is not None: b.write(Int(self.story_id))
        return b.getvalue()


class StoryViews(TLObject):
    ID = 0x8d595cd6
    QUALNAME = "types.StoryViews"
    __slots__ = ["has_viewers", "views_count", "forwards_count", "reactions", "reactions_count", "recent_viewers"]
    def __init__(self, *, views_count: int, has_viewers: Optional[bool] = None, forwards_count: Optional[int] = None,
                 reactions: Optional[Any] = None, reactions_count: Optional[int] = None, recent_viewers: Optional[List[int]] = None):
        self.views_count = views_count
        self.has_viewers = has_viewers
        self.forwards_count = forwards_count
        self.reactions = reactions
        self.reactions_count = reactions_count
        self.recent_viewers = recent_viewers
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "StoryViews":
        flags = Int.read(b)
        has_viewers = bool(flags & (1 << 1))
        views_count = Int.read(b)
        forwards_count = Int.read(b) if (flags & (1 << 2)) else None
        reactions = TLObject.read(b) if (flags & (1 << 3)) else []
        reactions_count = Int.read(b) if (flags & (1 << 4)) else None
        recent_viewers = TLObject.read(b, Long) if (flags & (1 << 0)) else None
        return StoryViews(
            views_count=views_count, has_viewers=has_viewers, forwards_count=forwards_count,
            reactions=reactions, reactions_count=reactions_count, recent_viewers=recent_viewers
        )
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 0
        if self.recent_viewers is not None: flags |= (1 << 0)
        if self.has_viewers: flags |= (1 << 1)
        if self.forwards_count is not None: flags |= (1 << 2)
        if self.reactions: flags |= (1 << 3)
        if self.reactions_count is not None: flags |= (1 << 4)
        b.write(Int(flags))
        b.write(Int(self.views_count))
        if self.forwards_count is not None: b.write(Int(self.forwards_count))
        if self.reactions: b.write(Vector(self.reactions).write())
        if self.reactions_count is not None: b.write(Int(self.reactions_count))
        if self.recent_viewers is not None: b.write(Vector(self.recent_viewers, Long).write())
        return b.getvalue()


class StoryItemDeleted(TLObject):
    ID = 0x51e6ee4f
    QUALNAME = "types.StoryItemDeleted"
    __slots__ = ["id"]
    def __init__(self, *, id: int):
        self.id = id
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "StoryItemDeleted":
        return StoryItemDeleted(id=Int.read(b))
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        b.write(Int(self.id))
        return b.getvalue()


class StoryItemSkipped(TLObject):
    ID = 0xffadc913
    QUALNAME = "types.StoryItemSkipped"
    __slots__ = ["close_friends", "id", "date", "expire_date"]
    def __init__(self, *, id: int, date: int, expire_date: int, close_friends: Optional[bool] = None):
        self.close_friends = close_friends
        self.id = id
        self.date = date
        self.expire_date = expire_date
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "StoryItemSkipped":
        flags = Int.read(b)
        close_friends = bool(flags & (1 << 8))
        id = Int.read(b)
        date = Int.read(b)
        expire_date = Int.read(b)
        return StoryItemSkipped(id=id, date=date, expire_date=expire_date, close_friends=close_friends)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 1 << 8 if self.close_friends else 0
        b.write(Int(flags))
        b.write(Int(self.id))
        b.write(Int(self.date))
        b.write(Int(self.expire_date))
        return b.getvalue()


class StoryItem(TLObject):
    ID = 0x79b26a24
    QUALNAME = "types.StoryItem"
    __slots__ = [
        "pinned", "public", "close_friends", "min", "noforwards", "edited", "contacts", "selected_contacts",
        "out", "id", "date", "from_id", "fwd_from", "expire_date", "caption", "entities", "media", "media_areas",
        "privacy", "views", "sent_reaction"
    ]
    def __init__(self, **kwargs):
        for k in self.__slots__:
            setattr(self, k, kwargs.get(k))
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "StoryItem":
        flags = Int.read(b)
        pinned = bool(flags & (1 << 5))
        public = bool(flags & (1 << 7))
        close_friends = bool(flags & (1 << 8))
        min_ = bool(flags & (1 << 9))
        noforwards = bool(flags & (1 << 10))
        edited = bool(flags & (1 << 11))
        contacts = bool(flags & (1 << 12))
        selected_contacts = bool(flags & (1 << 13))
        out = bool(flags & (1 << 16))
        id = Int.read(b)
        date = Int.read(b)
        from_id = TLObject.read(b) if (flags & (1 << 18)) else None
        fwd_from = TLObject.read(b) if (flags & (1 << 17)) else None
        expire_date = Int.read(b)
        caption = String.read(b) if (flags & (1 << 0)) else None
        entities = TLObject.read(b) if (flags & (1 << 1)) else []
        media = TLObject.read(b)
        media_areas = TLObject.read(b) if (flags & (1 << 14)) else []
        privacy = TLObject.read(b) if (flags & (1 << 2)) else []
        views = TLObject.read(b) if (flags & (1 << 3)) else None
        sent_reaction = TLObject.read(b) if (flags & (1 << 15)) else None
        return StoryItem(
            pinned=pinned, public=public, close_friends=close_friends, min=min_, noforwards=noforwards,
            edited=edited, contacts=contacts, selected_contacts=selected_contacts, out=out, id=id,
            date=date, from_id=from_id, fwd_from=fwd_from, expire_date=expire_date, caption=caption,
            entities=entities, media=media, media_areas=media_areas, privacy=privacy, views=views, sent_reaction=sent_reaction
        )
    def write(self, *args) -> bytes:
        return b""


class PeerStories(TLObject):
    ID = 0x9a35e999
    QUALNAME = "types.PeerStories"
    __slots__ = ["peer", "max_read_id", "stories"]
    def __init__(self, *, peer: Any, stories: List[Any], max_read_id: Optional[int] = None):
        self.peer = peer
        self.stories = stories
        self.max_read_id = max_read_id
    @staticmethod
    def read(b: BytesIO, *args: Any) -> "PeerStories":
        flags = Int.read(b)
        peer = TLObject.read(b)
        max_read_id = Int.read(b) if (flags & (1 << 0)) else None
        stories = TLObject.read(b)
        return PeerStories(peer=peer, max_read_id=max_read_id, stories=stories)
    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 1 if self.max_read_id is not None else 0
        b.write(Int(flags))
        b.write(self.peer.write())
        if self.max_read_id is not None:
            b.write(Int(self.max_read_id))
        b.write(Vector(self.stories or []).write())
        return b.getvalue()


class MessageMediaDocument178(TLObject):
    ID = 0x4cf4d72d
    QUALNAME = "types.MessageMediaDocument"
    __slots__ = ["nopremium", "spoiler", "video", "round", "voice", "document", "alt_document", "ttl_seconds"]
    
    def __init__(self, *, nopremium: Optional[bool] = None, spoiler: Optional[bool] = None, video: Optional[bool] = None, round: Optional[bool] = None, voice: Optional[bool] = None, document: Any = None, alt_document: Any = None, ttl_seconds: Optional[int] = None):
        self.nopremium = nopremium
        self.spoiler = spoiler
        self.video = video
        self.round = round
        self.voice = voice
        self.document = document
        self.alt_document = alt_document
        self.ttl_seconds = ttl_seconds

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MessageMediaDocument178":
        flags = Int.read(b)
        nopremium = True if flags & (1 << 3) else False
        spoiler = True if flags & (1 << 4) else False
        video = True if flags & (1 << 6) else False
        round = True if flags & (1 << 7) else False
        voice = True if flags & (1 << 8) else False
        document = TLObject.read(b) if flags & (1 << 0) else None
        alt_document = TLObject.read(b) if flags & (1 << 5) else None
        ttl_seconds = Int.read(b) if flags & (1 << 2) else None
        return MessageMediaDocument178(nopremium=nopremium, spoiler=spoiler, video=video, round=round, voice=voice, document=document, alt_document=alt_document, ttl_seconds=ttl_seconds)

    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 0
        flags |= (1 << 3) if self.nopremium else 0
        flags |= (1 << 4) if self.spoiler else 0
        flags |= (1 << 6) if self.video else 0
        flags |= (1 << 7) if self.round else 0
        flags |= (1 << 8) if self.voice else 0
        flags |= (1 << 0) if self.document is not None else 0
        flags |= (1 << 5) if self.alt_document is not None else 0
        flags |= (1 << 2) if self.ttl_seconds is not None else 0
        b.write(Int(flags))
        if self.document is not None:
            b.write(self.document.write())
        if self.alt_document is not None:
            b.write(self.alt_document.write())
        if self.ttl_seconds is not None:
            b.write(Int(self.ttl_seconds))
        return b.getvalue()


class DocumentAttributeVideo166(TLObject):
    ID = 0xd38ff1c2
    QUALNAME = "types.DocumentAttributeVideo"
    __slots__ = ["round_message", "supports_streaming", "nosound", "duration", "w", "h", "preload_prefix_size"]

    def __init__(self, *, duration: float, w: int, h: int, round_message: Optional[bool] = None, supports_streaming: Optional[bool] = None, nosound: Optional[bool] = None, preload_prefix_size: Optional[int] = None):
        self.round_message = round_message
        self.supports_streaming = supports_streaming
        self.nosound = nosound
        self.duration = duration
        self.w = w
        self.h = h
        self.preload_prefix_size = preload_prefix_size

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "DocumentAttributeVideo166":
        flags = Int.read(b)
        round_message = True if flags & (1 << 0) else False
        supports_streaming = True if flags & (1 << 1) else False
        nosound = True if flags & (1 << 3) else False
        duration = Double.read(b)
        w = Int.read(b)
        h = Int.read(b)
        preload_prefix_size = Int.read(b) if flags & (1 << 2) else None
        return DocumentAttributeVideo166(
            round_message=round_message,
            supports_streaming=supports_streaming,
            nosound=nosound,
            duration=duration,
            w=w,
            h=h,
            preload_prefix_size=preload_prefix_size
        )

    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 0
        flags |= (1 << 0) if self.round_message else 0
        flags |= (1 << 1) if self.supports_streaming else 0
        flags |= (1 << 2) if self.preload_prefix_size is not None else 0
        flags |= (1 << 3) if self.nosound else 0
        b.write(Int(flags))
        b.write(Double(self.duration))
        b.write(Int(self.w))
        b.write(Int(self.h))
        if self.preload_prefix_size is not None:
            b.write(Int(self.preload_prefix_size))
        return b.getvalue()


class DocumentAttributeVideo178(TLObject):
    ID = 0x43c57c48
    QUALNAME = "types.DocumentAttributeVideo"
    __slots__ = ["round_message", "supports_streaming", "nosound", "duration", "w", "h", "preload_prefix_size", "video_start_ts", "video_codec"]

    def __init__(self, *, duration: float, w: int, h: int, round_message: Optional[bool] = None, supports_streaming: Optional[bool] = None, nosound: Optional[bool] = None, preload_prefix_size: Optional[int] = None, video_start_ts: Optional[float] = None, video_codec: Optional[str] = None):
        self.round_message = round_message
        self.supports_streaming = supports_streaming
        self.nosound = nosound
        self.duration = duration
        self.w = w
        self.h = h
        self.preload_prefix_size = preload_prefix_size
        self.video_start_ts = video_start_ts
        self.video_codec = video_codec

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "DocumentAttributeVideo178":
        flags = Int.read(b)
        round_message = True if flags & (1 << 0) else False
        supports_streaming = True if flags & (1 << 1) else False
        nosound = True if flags & (1 << 3) else False
        duration = Double.read(b)
        w = Int.read(b)
        h = Int.read(b)
        preload_prefix_size = Int.read(b) if flags & (1 << 2) else None
        video_start_ts = Double.read(b) if flags & (1 << 4) else None
        video_codec = String.read(b) if flags & (1 << 5) else None
        return DocumentAttributeVideo178(
            round_message=round_message,
            supports_streaming=supports_streaming,
            nosound=nosound,
            duration=duration,
            w=w,
            h=h,
            preload_prefix_size=preload_prefix_size,
            video_start_ts=video_start_ts,
            video_codec=video_codec
        )

    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 0
        flags |= (1 << 0) if self.round_message else 0
        flags |= (1 << 1) if self.supports_streaming else 0
        flags |= (1 << 2) if self.preload_prefix_size is not None else 0
        flags |= (1 << 3) if self.nosound else 0
        flags |= (1 << 4) if self.video_start_ts is not None else 0
        flags |= (1 << 5) if self.video_codec is not None else 0
        b.write(Int(flags))
        b.write(Double(self.duration))
        b.write(Int(self.w))
        b.write(Int(self.h))
        if self.preload_prefix_size is not None:
            b.write(Int(self.preload_prefix_size))
        if self.video_start_ts is not None:
            b.write(Double(self.video_start_ts))
        if self.video_codec is not None:
            b.write(String(self.video_codec))
        return b.getvalue()


class PeerColor(TLObject):
    ID = 0xb54b5acf
    QUALNAME = "types.PeerColor"
    __slots__ = ["color", "background_emoji_id"]

    def __init__(self, *, color: Optional[int] = None, background_emoji_id: Optional[int] = None):
        self.color = color
        self.background_emoji_id = background_emoji_id

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "PeerColor":
        flags = Int.read(b)
        color = Int.read(b) if (flags & (1 << 0)) else None
        background_emoji_id = Long.read(b) if (flags & (1 << 1)) else None
        return PeerColor(color=color, background_emoji_id=background_emoji_id)

    def write(self, *args) -> bytes:
        b = BytesIO()
        b.write(Int(self.ID, False))
        flags = 0
        flags |= (1 << 0) if self.color is not None else 0
        flags |= (1 << 1) if self.background_emoji_id is not None else 0
        b.write(Int(flags))
        if self.color is not None:
            b.write(Int(self.color))
        if self.background_emoji_id is not None:
            b.write(Long(self.background_emoji_id))
        return b.getvalue()


class PeerColorCollectible(TLObject):
    ID = 0xb9c0639a
    QUALNAME = "types.PeerColorCollectible"
    __slots__ = ["collectible_id", "gift_emoji_id", "background_emoji_id", "accent_color", "colors", "dark_accent_color", "dark_colors"]

    def __init__(self, *, collectible_id: int, gift_emoji_id: int, background_emoji_id: int, accent_color: int, colors: List[int], dark_accent_color: Optional[int] = None, dark_colors: Optional[List[int]] = None):
        self.collectible_id = collectible_id
        self.gift_emoji_id = gift_emoji_id
        self.background_emoji_id = background_emoji_id
        self.accent_color = accent_color
        self.colors = colors
        self.dark_accent_color = dark_accent_color
        self.dark_colors = dark_colors

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "PeerColorCollectible":
        flags = Int.read(b)
        collectible_id = Long.read(b)
        gift_emoji_id = Long.read(b)
        background_emoji_id = Long.read(b)
        accent_color = Int.read(b)
        colors = TLObject.read(b)
        dark_accent_color = Int.read(b) if (flags & (1 << 0)) else None
        dark_colors = TLObject.read(b) if (flags & (1 << 1)) else []
        return PeerColorCollectible(
            collectible_id=collectible_id,
            gift_emoji_id=gift_emoji_id,
            background_emoji_id=background_emoji_id,
            accent_color=accent_color,
            colors=colors,
            dark_accent_color=dark_accent_color,
            dark_colors=dark_colors
        )

    def write(self, *args) -> bytes:
        return b""


class RecentStory(TLObject):
    ID = 0x711d692d
    QUALNAME = "types.RecentStory"
    __slots__ = ["live", "max_id"]

    def __init__(self, *, live: Optional[bool] = None, max_id: Optional[int] = None):
        self.live = live
        self.max_id = max_id

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "RecentStory":
        flags = Int.read(b)
        live = True if (flags & (1 << 0)) else False
        max_id = Int.read(b) if (flags & (1 << 1)) else None
        return RecentStory(live=live, max_id=max_id)

    def write(self, *args) -> bytes:
        return b""


class InputReplyToMessage(TLObject):
    ID = 0x22c0f6d5
    QUALNAME = "types.InputReplyToMessage"
    __slots__ = ["reply_to_msg_id", "top_msg_id", "reply_to_peer_id", "quote_text", "quote_entities", "quote_offset"]

    def __init__(self, *, reply_to_msg_id: int, top_msg_id: Optional[int] = None, reply_to_peer_id: Any = None, quote_text: Optional[str] = None, quote_entities: Optional[List[Any]] = None, quote_offset: Optional[int] = None):
        self.reply_to_msg_id = reply_to_msg_id
        self.top_msg_id = top_msg_id
        self.reply_to_peer_id = reply_to_peer_id
        self.quote_text = quote_text
        self.quote_entities = quote_entities or []
        self.quote_offset = quote_offset

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "InputReplyToMessage":
        flags = Int.read(b)
        reply_to_msg_id = Int.read(b)
        top_msg_id = Int.read(b) if (flags & (1 << 0)) else None
        reply_to_peer_id = TLObject.read(b) if (flags & (1 << 1)) else None
        quote_text = String.read(b) if (flags & (1 << 2)) else None
        quote_entities = TLObject.read(b) if (flags & (1 << 3)) else []
        quote_offset = Int.read(b) if (flags & (1 << 4)) else None
        return InputReplyToMessage(
            reply_to_msg_id=reply_to_msg_id,
            top_msg_id=top_msg_id,
            reply_to_peer_id=reply_to_peer_id,
            quote_text=quote_text,
            quote_entities=quote_entities,
            quote_offset=quote_offset
        )

    def write(self, *args) -> bytes:
        return b""


class InputReplyToStory(TLObject):
    ID = 0x5881323a
    QUALNAME = "types.InputReplyToStory"
    __slots__ = ["peer", "story_id"]

    def __init__(self, *, peer: Any, story_id: int):
        self.peer = peer
        self.story_id = story_id

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "InputReplyToStory":
        peer = TLObject.read(b)
        story_id = Int.read(b)
        return InputReplyToStory(peer=peer, story_id=story_id)

    def write(self, *args) -> bytes:
        return b""


class DraftMessage178(TLObject):
    ID = 0x3fccf7ef
    QUALNAME = "types.DraftMessage"
    __slots__ = ["message", "date", "no_webpage", "invert_media", "reply_to", "entities", "media"]

    def __init__(self, *, message: str, date: int, no_webpage: Optional[bool] = None, invert_media: Optional[bool] = None, reply_to: Any = None, entities: Optional[List[Any]] = None, media: Any = None):
        self.message = message
        self.date = date
        self.no_webpage = no_webpage
        self.invert_media = invert_media
        self.reply_to = reply_to
        self.entities = entities or []
        self.media = media

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "DraftMessage178":
        flags = Int.read(b)
        no_webpage = True if (flags & (1 << 1)) else False
        invert_media = True if (flags & (1 << 6)) else False
        reply_to = TLObject.read(b) if (flags & (1 << 4)) else None
        message = String.read(b)
        entities = TLObject.read(b) if (flags & (1 << 3)) else []
        media = TLObject.read(b) if (flags & (1 << 5)) else None
        date = Int.read(b)
        return DraftMessage178(
            message=message,
            date=date,
            no_webpage=no_webpage,
            invert_media=invert_media,
            reply_to=reply_to,
            entities=entities,
            media=media
        )

    def write(self, *args) -> bytes:
        return b""


class DraftMessageLatest(TLObject):
    ID = 0x60fe3294
    QUALNAME = "types.DraftMessage"
    __slots__ = ["message", "date", "no_webpage", "invert_media", "reply_to", "entities", "media", "effect", "suggested_post", "rich_message"]

    def __init__(self, *, message: str, date: int, no_webpage: Optional[bool] = None, invert_media: Optional[bool] = None, reply_to: Any = None, entities: Optional[List[Any]] = None, media: Any = None, effect: Optional[int] = None, suggested_post: Any = None, rich_message: Any = None):
        self.message = message
        self.date = date
        self.no_webpage = no_webpage
        self.invert_media = invert_media
        self.reply_to = reply_to
        self.entities = entities or []
        self.media = media
        self.effect = effect
        self.suggested_post = suggested_post
        self.rich_message = rich_message

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "DraftMessageLatest":
        flags = Int.read(b)
        no_webpage = True if (flags & (1 << 1)) else False
        invert_media = True if (flags & (1 << 6)) else False
        reply_to = TLObject.read(b) if (flags & (1 << 4)) else None
        message = String.read(b)
        entities = TLObject.read(b) if (flags & (1 << 3)) else []
        media = TLObject.read(b) if (flags & (1 << 5)) else None
        date = Int.read(b)
        effect = Long.read(b) if (flags & (1 << 7)) else None
        suggested_post = TLObject.read(b) if (flags & (1 << 8)) else None
        rich_message = TLObject.read(b) if (flags & (1 << 9)) else None
        return DraftMessageLatest(
            message=message,
            date=date,
            no_webpage=no_webpage,
            invert_media=invert_media,
            reply_to=reply_to,
            entities=entities,
            media=media,
            effect=effect,
            suggested_post=suggested_post,
            rich_message=rich_message
        )

    def write(self, *args) -> bytes:
        return b""


class MessageReplyHeader178(TLObject):
    ID = 0xafbc09db
    QUALNAME = "types.MessageReplyHeader"
    __slots__ = [
        "reply_to_scheduled", "forum_topic", "quote",
        "reply_to_msg_id", "reply_to_peer_id", "reply_from",
        "reply_media", "reply_to_top_id", "quote_text",
        "quote_entities", "quote_offset"
    ]

    def __init__(
        self,
        *,
        reply_to_scheduled: Optional[bool] = None,
        forum_topic: Optional[bool] = None,
        quote: Optional[bool] = None,
        reply_to_msg_id: Optional[int] = None,
        reply_to_peer_id: Any = None,
        reply_from: Any = None,
        reply_media: Any = None,
        reply_to_top_id: Optional[int] = None,
        quote_text: Optional[str] = None,
        quote_entities: Optional[List[Any]] = None,
        quote_offset: Optional[int] = None
    ):
        self.reply_to_scheduled = reply_to_scheduled
        self.forum_topic = forum_topic
        self.quote = quote
        self.reply_to_msg_id = reply_to_msg_id
        self.reply_to_peer_id = reply_to_peer_id
        self.reply_from = reply_from
        self.reply_media = reply_media
        self.reply_to_top_id = reply_to_top_id
        self.quote_text = quote_text
        self.quote_entities = quote_entities or []
        self.quote_offset = quote_offset

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MessageReplyHeader178":
        flags = Int.read(b)
        reply_to_scheduled = True if (flags & (1 << 2)) else False
        forum_topic = True if (flags & (1 << 3)) else False
        quote = True if (flags & (1 << 9)) else False
        reply_to_msg_id = Int.read(b) if (flags & (1 << 4)) else None
        reply_to_peer_id = TLObject.read(b) if (flags & (1 << 0)) else None
        reply_from = TLObject.read(b) if (flags & (1 << 5)) else None
        reply_media = TLObject.read(b) if (flags & (1 << 8)) else None
        reply_to_top_id = Int.read(b) if (flags & (1 << 1)) else None
        quote_text = String.read(b) if (flags & (1 << 6)) else None
        quote_entities = TLObject.read(b) if (flags & (1 << 7)) else []
        quote_offset = Int.read(b) if (flags & (1 << 10)) else None
        return MessageReplyHeader178(
            reply_to_scheduled=reply_to_scheduled,
            forum_topic=forum_topic,
            quote=quote,
            reply_to_msg_id=reply_to_msg_id,
            reply_to_peer_id=reply_to_peer_id,
            reply_from=reply_from,
            reply_media=reply_media,
            reply_to_top_id=reply_to_top_id,
            quote_text=quote_text,
            quote_entities=quote_entities,
            quote_offset=quote_offset
        )

    def write(self, *args) -> bytes:
        return b""


class MessageReplyStoryHeader(TLObject):
    ID = 0x0e5af939
    QUALNAME = "types.MessageReplyStoryHeader"
    __slots__ = ["peer", "story_id"]

    def __init__(self, *, peer: Any, story_id: int):
        self.peer = peer
        self.story_id = story_id

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MessageReplyStoryHeader":
        peer = TLObject.read(b)
        story_id = Int.read(b)
        return MessageReplyStoryHeader(peer=peer, story_id=story_id)

    def write(self, *args) -> bytes:
        return b""


class MessageReplyHeaderLatest(TLObject):
    ID = 0x1b97dd66
    QUALNAME = "types.MessageReplyHeader"
    __slots__ = [
        "reply_to_scheduled", "forum_topic", "quote", "reply_to_ephemeral",
        "reply_to_msg_id", "reply_to_peer_id", "reply_from",
        "reply_media", "reply_to_top_id", "quote_text",
        "quote_entities", "quote_offset", "todo_item_id", "poll_option"
    ]

    def __init__(
        self,
        *,
        reply_to_scheduled: Optional[bool] = None,
        forum_topic: Optional[bool] = None,
        quote: Optional[bool] = None,
        reply_to_ephemeral: Optional[bool] = None,
        reply_to_msg_id: Optional[int] = None,
        reply_to_peer_id: Any = None,
        reply_from: Any = None,
        reply_media: Any = None,
        reply_to_top_id: Optional[int] = None,
        quote_text: Optional[str] = None,
        quote_entities: Optional[List[Any]] = None,
        quote_offset: Optional[int] = None,
        todo_item_id: Optional[int] = None,
        poll_option: Optional[bytes] = None
    ):
        self.reply_to_scheduled = reply_to_scheduled
        self.forum_topic = forum_topic
        self.quote = quote
        self.reply_to_ephemeral = reply_to_ephemeral
        self.reply_to_msg_id = reply_to_msg_id
        self.reply_to_peer_id = reply_to_peer_id
        self.reply_from = reply_from
        self.reply_media = reply_media
        self.reply_to_top_id = reply_to_top_id
        self.quote_text = quote_text
        self.quote_entities = quote_entities or []
        self.quote_offset = quote_offset
        self.todo_item_id = todo_item_id
        self.poll_option = poll_option

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MessageReplyHeaderLatest":
        flags = Int.read(b)
        reply_to_scheduled = True if (flags & (1 << 2)) else False
        forum_topic = True if (flags & (1 << 3)) else False
        quote = True if (flags & (1 << 9)) else False
        reply_to_ephemeral = True if (flags & (1 << 13)) else False
        reply_to_msg_id = Int.read(b) if (flags & (1 << 4)) else None
        reply_to_peer_id = TLObject.read(b) if (flags & (1 << 0)) else None
        reply_from = TLObject.read(b) if (flags & (1 << 5)) else None
        reply_media = TLObject.read(b) if (flags & (1 << 8)) else None
        reply_to_top_id = Int.read(b) if (flags & (1 << 1)) else None
        quote_text = String.read(b) if (flags & (1 << 6)) else None
        quote_entities = TLObject.read(b) if (flags & (1 << 7)) else []
        quote_offset = Int.read(b) if (flags & (1 << 10)) else None
        todo_item_id = Int.read(b) if (flags & (1 << 11)) else None
        poll_option = Bytes.read(b) if (flags & (1 << 12)) else None
        return MessageReplyHeaderLatest(
            reply_to_scheduled=reply_to_scheduled,
            forum_topic=forum_topic,
            quote=quote,
            reply_to_ephemeral=reply_to_ephemeral,
            reply_to_msg_id=reply_to_msg_id,
            reply_to_peer_id=reply_to_peer_id,
            reply_from=reply_from,
            reply_media=reply_media,
            reply_to_top_id=reply_to_top_id,
            quote_text=quote_text,
            quote_entities=quote_entities,
            quote_offset=quote_offset,
            todo_item_id=todo_item_id,
            poll_option=poll_option
        )

    def write(self, *args) -> bytes:
        return b""


class MessageFwdHeader178(TLObject):
    ID = 0x4e4df4bb
    QUALNAME = "types.MessageFwdHeader"
    __slots__ = [
        "imported", "saved_out", "from_id", "from_name", "date",
        "channel_post", "post_author", "saved_from_peer", "saved_from_msg_id",
        "saved_from_id", "saved_from_name", "saved_date", "psa_type"
    ]

    def __init__(
        self,
        *,
        date: int,
        imported: Optional[bool] = None,
        saved_out: Optional[bool] = None,
        from_id: Any = None,
        from_name: Optional[str] = None,
        channel_post: Optional[int] = None,
        post_author: Optional[str] = None,
        saved_from_peer: Any = None,
        saved_from_msg_id: Optional[int] = None,
        saved_from_id: Any = None,
        saved_from_name: Optional[str] = None,
        saved_date: Optional[int] = None,
        psa_type: Optional[str] = None
    ):
        self.date = date
        self.imported = imported
        self.saved_out = saved_out
        self.from_id = from_id
        self.from_name = from_name
        self.channel_post = channel_post
        self.post_author = post_author
        self.saved_from_peer = saved_from_peer
        self.saved_from_msg_id = saved_from_msg_id
        self.saved_from_id = saved_from_id
        self.saved_from_name = saved_from_name
        self.saved_date = saved_date
        self.psa_type = psa_type

    @staticmethod
    def read(b: BytesIO, *args: Any) -> "MessageFwdHeader178":
        flags = Int.read(b)
        imported = True if (flags & (1 << 7)) else False
        saved_out = True if (flags & (1 << 11)) else False
        from_id = TLObject.read(b) if (flags & (1 << 0)) else None
        from_name = String.read(b) if (flags & (1 << 5)) else None
        date = Int.read(b)
        channel_post = Int.read(b) if (flags & (1 << 2)) else None
        post_author = String.read(b) if (flags & (1 << 3)) else None
        saved_from_peer = TLObject.read(b) if (flags & (1 << 4)) else None
        saved_from_msg_id = Int.read(b) if (flags & (1 << 4)) else None
        saved_from_id = TLObject.read(b) if (flags & (1 << 8)) else None
        saved_from_name = String.read(b) if (flags & (1 << 9)) else None
        saved_date = Int.read(b) if (flags & (1 << 10)) else None
        psa_type = String.read(b) if (flags & (1 << 6)) else None
        return MessageFwdHeader178(
            date=date,
            imported=imported,
            saved_out=saved_out,
            from_id=from_id,
            from_name=from_name,
            channel_post=channel_post,
            post_author=post_author,
            saved_from_peer=saved_from_peer,
            saved_from_msg_id=saved_from_msg_id,
            saved_from_id=saved_from_id,
            saved_from_name=saved_from_name,
            saved_date=saved_date,
            psa_type=psa_type
        )

    def write(self, *args) -> bytes:
        return b""


# Register in Pyrogram's TL registry
def patch_pyrogram():
    raw_all.objects[Birthday.ID] = Birthday
    raw_all.objects[UserFull178.ID] = UserFull178
    raw_all.objects[PeerSettings178.ID] = PeerSettings178
    raw_all.objects[PeerNotifySettings178.ID] = PeerNotifySettings178
    raw_all.objects[Message178.ID] = Message178
    raw_all.objects[Channel178.ID] = Channel178
    raw_all.objects[User178.ID] = User178
    raw_all.objects[UserStatusRecently178.ID] = UserStatusRecently178
    raw_all.objects[UserStatusLastWeek178.ID] = UserStatusLastWeek178
    raw_all.objects[UserStatusLastMonth178.ID] = UserStatusLastMonth178
    raw_all.objects[BusinessWeeklyOpen.ID] = BusinessWeeklyOpen
    raw_all.objects[BusinessWorkHours.ID] = BusinessWorkHours
    raw_all.objects[BusinessLocation.ID] = BusinessLocation
    raw_all.objects[BusinessRecipients.ID] = BusinessRecipients
    raw_all.objects[BusinessAwayMessageScheduleAlways.ID] = BusinessAwayMessageScheduleAlways
    raw_all.objects[BusinessAwayMessageScheduleOutsideWorkHours.ID] = BusinessAwayMessageScheduleOutsideWorkHours
    raw_all.objects[BusinessAwayMessageScheduleCustom.ID] = BusinessAwayMessageScheduleCustom
    raw_all.objects[BusinessGreetingMessage.ID] = BusinessGreetingMessage
    raw_all.objects[BusinessAwayMessage.ID] = BusinessAwayMessage
    raw_all.objects[BusinessIntro.ID] = BusinessIntro
    raw_all.objects[PrivacyValueAllowCloseFriends.ID] = PrivacyValueAllowCloseFriends
    raw_all.objects[PrivacyValueAllowPremium.ID] = PrivacyValueAllowPremium
    raw_all.objects[MediaAreaCoordinates.ID] = MediaAreaCoordinates
    raw_all.objects[MediaAreaVenue.ID] = MediaAreaVenue
    raw_all.objects[MediaAreaGeoPoint.ID] = MediaAreaGeoPoint
    raw_all.objects[MediaAreaSuggestedReaction.ID] = MediaAreaSuggestedReaction
    raw_all.objects[MediaAreaChannelPost.ID] = MediaAreaChannelPost
    raw_all.objects[StoryFwdHeader.ID] = StoryFwdHeader
    raw_all.objects[StoryViews.ID] = StoryViews
    raw_all.objects[StoryItemDeleted.ID] = StoryItemDeleted
    raw_all.objects[StoryItemSkipped.ID] = StoryItemSkipped
    raw_all.objects[StoryItem.ID] = StoryItem
    raw_all.objects[PeerStories.ID] = PeerStories
    raw_all.objects[MessageMediaDocument178.ID] = MessageMediaDocument178
    raw_all.objects[DocumentAttributeVideo166.ID] = DocumentAttributeVideo166
    raw_all.objects[DocumentAttributeVideo178.ID] = DocumentAttributeVideo178
    raw_all.objects[PeerColor.ID] = PeerColor
    raw_all.objects[PeerColorCollectible.ID] = PeerColorCollectible
    raw_all.objects[RecentStory.ID] = RecentStory
    raw_all.objects[InputReplyToMessage.ID] = InputReplyToMessage
    raw_all.objects[InputReplyToStory.ID] = InputReplyToStory
    raw_all.objects[DraftMessage178.ID] = DraftMessage178
    raw_all.objects[DraftMessageLatest.ID] = DraftMessageLatest
    raw_all.objects[MessageReplyHeader178.ID] = MessageReplyHeader178
    raw_all.objects[MessageReplyStoryHeader.ID] = MessageReplyStoryHeader
    raw_all.objects[MessageReplyHeaderLatest.ID] = MessageReplyHeaderLatest
    raw_all.objects[MessageFwdHeader178.ID] = MessageFwdHeader178

patch_pyrogram()

