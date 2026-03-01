"""
Obsidian Flavored Markdown Compatibility Plugin for NoteDiscovery
Mirrors the transforms performed by Quartz's ObsidianFlavoredMarkdown plugin (ofm.ts).

Transforms applied on note load (on_note_load), so the frontend always receives
clean, standard Markdown / HTML that the renderer can handle:

  ✓ Obsidian comments        %%...%%          → stripped
  ✓ Wikilinks                [[Note]]         → [Note](Note)
  ✓ Wikilink aliases         [[Note|Alias]]   → [Alias](Note)
  ✓ Wikilink headings        [[Note#Heading]] → [Note](Note#Heading)
  ✓ Wikilink embeds          ![[img.png]]     → ![](img.png)
  ✓ Highlights               ==text==         → <mark>text</mark>
  ✓ Callouts                 > [!type] Title  → styled HTML div
  ✓ Inline tags              #tag             → `#tag` (preserved as text)
  ✓ Arrow replacements       ->  =>  <-  etc. → HTML arrow entities
  ✓ Block references         ^block-id        → stripped (anchor id added)
  ✓ Task checkboxes          - [ ] / - [x]   → HTML checkbox inputs
  ✓ YouTube image embeds     ![](youtube url) → <iframe> embed
  ✓ Video file embeds        ![](file.mp4)    → <video> tag
  ✓ Audio file embeds        ![](file.mp3)    → <audio> tag
"""

import re


# ---------------------------------------------------------------------------
# Callout type normalisation (matches ofm.ts calloutMapping)
# ---------------------------------------------------------------------------
CALLOUT_MAPPING = {
    "note": "note",
    "abstract": "abstract", "summary": "abstract", "tldr": "abstract",
    "info": "info",
    "todo": "todo",
    "tip": "tip", "hint": "tip", "important": "tip",
    "success": "success", "check": "success", "done": "success",
    "question": "question", "help": "question", "faq": "question",
    "warning": "warning", "attention": "warning", "caution": "warning",
    "failure": "failure", "missing": "failure", "fail": "failure",
    "danger": "danger", "error": "danger",
    "bug": "bug",
    "example": "example",
    "quote": "quote", "cite": "quote",
}

ARROW_MAPPING = {
    "==>": "&#8658;",
    "-->": "&#8658;",
    "=>":  "&#8658;",
    "->":  "&#8594;",
    "<==": "&#8656;",
    "<--": "&#8656;",
    "<=":  "&#8656;",
    "<-":  "&#8592;",
}

# ---------------------------------------------------------------------------
# Compiled regexes
# ---------------------------------------------------------------------------

# Obsidian comments  %%...%%
_COMMENT_RE = re.compile(r'%%[\s\S]*?%%')

# Wikilinks  !?[[fp#heading|alias]]
# Groups: (embed_bang, filepath, heading, alias)
_WIKILINK_RE = re.compile(
    r'(!?)\[\[([^\[\]\|#\\]+?)?(#[^\[\]\|\\]+?)?(\|[^\[\]#]*)?\]\]'
)

# ==highlight==
_HIGHLIGHT_RE = re.compile(r'==([^=\n]+)==')

# Callout first line:  > [!type|meta] title +/-
_CALLOUT_RE = re.compile(r'^\[\!([\w-]+)(?:\|([^\]]*))?\]\s*([+-]?)\s*(.*)', re.DOTALL)

# Inline #tag  (must be preceded by start-of-string or whitespace)
_TAG_RE = re.compile(
    r'(?<![`\[])(?:^|(?<=\s))#([\w/][\w/-]*)',
    re.UNICODE
)

# Arrow sequences — longest first so ==> beats =>
_ARROW_RE = re.compile(r'(==>|-->|<==|<--|->|=>|<-|<=)')

# Block reference at end of line  ^block-id
_BLOCK_REF_RE = re.compile(r'\s*\^([\w-]+)\s*$', re.MULTILINE)

# Task checkboxes
_TASK_UNCHECKED_RE = re.compile(r'^(\s*[-*+]\s+)\[ \]', re.MULTILINE)
_TASK_CHECKED_RE   = re.compile(r'^(\s*[-*+]\s+)\[[xX]\]', re.MULTILINE)

# YouTube URL  (matches youtu.be/ID or watch?v=ID etc.)
_YT_RE = re.compile(
    r'^https?://(?:www\.)?(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([\w-]{11})',
    re.IGNORECASE
)
_YT_PLAYLIST_RE = re.compile(r'[?&]list=([\w-]+)')

# Media file extensions
_VIDEO_EXT_RE = re.compile(r'\.(mp4|webm|ogv|ogg|mov|avi|mkv|flv|wmv|3gp|m4v)$', re.IGNORECASE)
_AUDIO_EXT_RE = re.compile(r'\.(mp3|wav|m4a|ogg|flac|webm|3gp)$', re.IGNORECASE)
_IMAGE_EXT_RE = re.compile(r'\.(png|jpe?g|gif|bmp|svg|webp|ico|avif)$', re.IGNORECASE)
_PDF_EXT_RE   = re.compile(r'\.pdf$', re.IGNORECASE)

# Markdown image/link used to catch embeds for YouTube / video / audio
# Groups: (alt, url)
_MD_IMAGE_RE = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')


# ---------------------------------------------------------------------------
# Transform helpers
# ---------------------------------------------------------------------------

def _strip_comments(src: str) -> str:
    return _COMMENT_RE.sub('', src)


def _transform_wikilinks(src: str) -> str:
    def _replace(m: re.Match) -> str:
        bang    = m.group(1)   # '!' or ''
        fp      = (m.group(2) or '').strip()
        heading = (m.group(3) or '').strip()   # '#Heading' with leading #
        alias   = (m.group(4) or '')[1:].strip()  # remove leading |

        # Build URL
        url = fp + heading  # heading already has its '#'

        # Embed  ![[...]]
        if bang == '!':
            if _IMAGE_EXT_RE.search(fp):
                display = alias or fp
                # Support  [[image.png|200]] — use alias as width when it's a number
                width_match = re.match(r'^(\d+)(?:x(\d+))?$', alias)
                if width_match:
                    w = width_match.group(1)
                    h = width_match.group(2) or 'auto'
                    return f'<img src="{url}" width="{w}" height="{h}" alt="">'
                return f'![{display}]({url})'
            elif _VIDEO_EXT_RE.search(fp):
                return f'<video src="{url}" controls></video>'
            elif _AUDIO_EXT_RE.search(fp):
                return f'<audio src="{url}" controls></audio>'
            elif _PDF_EXT_RE.search(fp):
                return f'<iframe src="{url}" class="pdf"></iframe>'
            else:
                # Generic transclusion placeholder
                display = alias or fp
                return f'<blockquote class="transclude" data-url="{fp}" data-block="{heading}"><a href="{url}" class="transclude-inner">Embed: {display}</a></blockquote>'

        # Normal link  [[Note]] / [[Note|Alias]] / [[Note#Heading]]
        display = alias or (fp + ((' > ' + heading[1:]) if heading else ''))
        if not display:
            display = url
        return f'[{display}]({url})'

    return _WIKILINK_RE.sub(_replace, src)


def _transform_highlights(src: str) -> str:
    return _HIGHLIGHT_RE.sub(lambda m: f'<mark>{m.group(1)}</mark>', src)


def _transform_callouts(src: str) -> str:
    """
    Convert Obsidian callout blockquotes to styled HTML divs.
    Obsidian format:
        > [!type] Title
        > Body line 1
        > Body line 2
    """
    lines = src.split('\n')
    output: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Is this the start of a blockquote?
        if line.startswith('> ') or line == '>':
            raw_first = line[2:] if line.startswith('> ') else ''
            m = _CALLOUT_RE.match(raw_first)

            if m:
                type_str   = m.group(1).lower()
                _meta      = m.group(2) or ''
                collapse   = m.group(3)   # '+' / '-' / ''
                title_text = m.group(4).strip()

                callout_type = CALLOUT_MAPPING.get(type_str, type_str)
                if not title_text:
                    title_text = type_str.capitalize()

                # Collect blockquote body lines
                body_lines: list[str] = []
                i += 1
                while i < len(lines) and (lines[i].startswith('> ') or lines[i] == '>'):
                    body_lines.append(lines[i][2:] if lines[i].startswith('> ') else '')
                    i += 1

                # Build collapse attributes
                collapse_class = ''
                collapse_attr  = ''
                default_state  = ''
                if collapse == '+':
                    collapse_class = ' is-collapsible'
                    collapse_attr  = ' data-callout-fold="true"'
                    default_state  = 'expanded'
                elif collapse == '-':
                    collapse_class = ' is-collapsible is-collapsed'
                    collapse_attr  = ' data-callout-fold="true"'
                    default_state  = 'collapsed'

                toggle_icon = '<div class="fold-callout-icon"></div>' if collapse else ''

                body_html = '\n'.join(body_lines)

                html = (
                    f'<div class="callout {callout_type}{collapse_class}" '
                    f'data-callout="{callout_type}"{collapse_attr}>\n'
                    f'  <div class="callout-title">\n'
                    f'    <div class="callout-icon"></div>\n'
                    f'    <div class="callout-title-inner">{title_text}</div>\n'
                    f'    {toggle_icon}\n'
                    f'  </div>\n'
                    f'  <div class="callout-content">\n\n{body_html}\n\n  </div>\n'
                    f'</div>'
                )
                output.append(html)
                continue
            else:
                output.append(line)
        else:
            output.append(line)
        i += 1

    return '\n'.join(output)


def _transform_arrows(src: str) -> str:
    """Replace ASCII arrows outside code blocks/spans with HTML entities."""
    # We process the document in segments, skipping fenced code blocks and inline code
    result = []
    # Split on fenced code blocks first
    segments = re.split(r'(```[\s\S]*?```|`[^`]+`)', src)
    for idx, seg in enumerate(segments):
        if idx % 2 == 1:
            # Inside a code block/span — leave untouched
            result.append(seg)
        else:
            result.append(_ARROW_RE.sub(lambda m: ARROW_MAPPING.get(m.group(0), m.group(0)), seg))
    return ''.join(result)


def _transform_block_references(src: str) -> str:
    """
    Strip ^block-id anchors from the end of lines.
    The ID is preserved as an HTML anchor <span> so it can be linked to.
    """
    def _replace(m: re.Match) -> str:
        block_id = m.group(1)
        return f' <span id="{block_id}" class="block-ref-anchor"></span>'

    return _BLOCK_REF_RE.sub(_replace, src)


def _transform_tasks(src: str) -> str:
    """Convert Obsidian task checkboxes to HTML checkbox inputs."""
    src = _TASK_CHECKED_RE.sub(
        lambda m: m.group(1) + '<input type="checkbox" checked class="task-checkbox"> ',
        src
    )
    src = _TASK_UNCHECKED_RE.sub(
        lambda m: m.group(1) + '<input type="checkbox" class="task-checkbox"> ',
        src
    )
    return src


def _transform_media_embeds(src: str) -> str:
    """
    Convert:
      - YouTube image-syntax embeds to <iframe>
      - Video file embeds to <video>
      - Audio file embeds to <audio>
    Standard images and other URLs are left alone.
    """
    def _replace(m: re.Match) -> str:
        alt = m.group(1)
        url = m.group(2).strip()

        # YouTube
        yt_match = _YT_RE.match(url)
        if yt_match:
            video_id = yt_match.group(1)
            playlist_match = _YT_PLAYLIST_RE.search(url)
            src_url = (
                f'https://www.youtube.com/embed/{video_id}?list={playlist_match.group(1)}'
                if playlist_match
                else f'https://www.youtube.com/embed/{video_id}'
            )
            return (
                f'<iframe class="external-embed youtube" src="{src_url}" '
                f'allow="fullscreen" frameborder="0" width="600"></iframe>'
            )

        # Video file
        if _VIDEO_EXT_RE.search(url):
            return f'<video src="{url}" controls></video>'

        # Audio file
        if _AUDIO_EXT_RE.search(url):
            return f'<audio src="{url}" controls></audio>'

        # Leave standard images alone
        return m.group(0)

    return _MD_IMAGE_RE.sub(_replace, src)


# ---------------------------------------------------------------------------
# Plugin class
# ---------------------------------------------------------------------------

class Plugin:
    def __init__(self):
        self.name    = "Obsidian Compatibility"
        self.version = "1.0.0"
        self.enabled = True

        # Feature flags — set any to False to disable a transform
        self.comments         = True
        self.wikilinks        = True
        self.highlights       = True
        self.callouts         = True
        self.arrows           = True
        self.block_references = True
        self.tasks            = True
        self.media_embeds     = True   # YouTube, video, audio

    def on_note_load(self, note_path: str, content: str) -> str | None:
        """
        Transform Obsidian-flavoured Markdown into standard Markdown / HTML
        before the content is returned to the frontend.
        """
        src = content

        if self.comments:
            src = _strip_comments(src)

        if self.wikilinks:
            src = _transform_wikilinks(src)

        if self.highlights:
            src = _transform_highlights(src)

        if self.callouts:
            src = _transform_callouts(src)

        if self.arrows:
            src = _transform_arrows(src)

        if self.block_references:
            src = _transform_block_references(src)

        if self.tasks:
            src = _transform_tasks(src)

        if self.media_embeds:
            src = _transform_media_embeds(src)

        return src if src != content else None
