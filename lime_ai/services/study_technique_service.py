from typing import Any

EXTERNAL_ACCOUNT_NOTE = (
    "This opens a third-party website in a new tab. You may be asked to sign in or create an "
    "account before saving your work. A free plan may be available, while some advanced features "
    "can require payment."
)


TECHNIQUES: dict[str, dict[str, Any]] = {
    "mind map": {
        "title": "Mind Map",
        "emoji": "\U0001f9e0",
        "link": "https://mindmeister.com/app/map/new",
        "link_text": "Open MindMeister",
        "tool_name": "MindMeister",
        "description": (
            "A mind map places the lesson topic in the centre and uses branches to group the main "
            "ideas and supporting details. It helps the learner see the whole lesson at a glance."
        ),
        "best_for": "Organising a broad lesson and seeing how its main ideas fit together.",
        "estimated_time": "10-15 minutes",
        "steps": [
            "Open MindMeister using the button below.",
            "Sign in or create an account if the website asks you to do so.",
            "Select the plus button or a blank mind-map template.",
            "Write the lesson name as the central topic.",
            "Add one branch for each main idea, then add smaller branches for examples or details.",
        ],
        "account_note": EXTERNAL_ACCOUNT_NOTE,
        "paper_alternative": (
            "No account needed: write the lesson topic in the centre of a sheet of paper and draw "
            "the same branches by hand."
        ),
    },
    "short notes": {
        "title": "Short Notes",
        "emoji": "\U0001f4dd",
        "link": "https://www.notion.so/",
        "link_text": "Open Notion",
        "tool_name": "Notion",
        "description": (
            "Short notes reduce a lesson to brief headings, key words, definitions, and examples. "
            "They make the important information easier to review without rereading everything."
        ),
        "best_for": "Quick revision and reducing a long lesson into manageable key points.",
        "estimated_time": "10 minutes",
        "steps": [
            "Open Notion using the button below.",
            "Sign in or create an account if the website asks you to do so.",
            "Create a new page and use the lesson name as its title.",
            "Add a heading for each main concept and write only a few bullet points below it.",
            "Finish with a three-sentence summary written in your own words.",
        ],
        "account_note": EXTERNAL_ACCOUNT_NOTE,
        "paper_alternative": (
            "No account needed: use a notebook and write headings, short bullet points, and a "
            "three-sentence summary."
        ),
    },
    "concept map": {
        "title": "Concept Map",
        "emoji": "\U0001f517",
        "link": "https://app.creately.com/",
        "link_text": "Open Creately",
        "tool_name": "Creately",
        "description": (
            "A concept map shows how ideas are related by connecting them with labelled arrows, "
            "such as 'causes', 'depends on', or 'is an example of'."
        ),
        "best_for": "Understanding relationships between concepts instead of memorising them separately.",
        "estimated_time": "15-20 minutes",
        "steps": [
            "Open Creately using the button below.",
            "Sign in or create an account if the website asks you to do so.",
            "Choose a concept-map template or start with a blank canvas.",
            "Add the main lesson concept first, followed by the related concepts.",
            "Connect each pair with an arrow and add words that explain the relationship.",
        ],
        "account_note": EXTERNAL_ACCOUNT_NOTE,
        "paper_alternative": (
            "No account needed: draw boxes on paper, connect related ideas with arrows, and label "
            "each connection."
        ),
    },
    "flowchart": {
        "title": "Flowchart",
        "emoji": "\U0001f4ca",
        "link": "https://www.lucidchart.com/",
        "link_text": "Open Lucidchart",
        "tool_name": "Lucidchart",
        "description": (
            "A flowchart turns a process into an ordered series of steps using boxes and arrows. "
            "It makes sequences, decisions, and cause-and-effect paths easier to follow."
        ),
        "best_for": "Lessons that describe a process, procedure, algorithm, or sequence of events.",
        "estimated_time": "15 minutes",
        "steps": [
            "Open Lucidchart using the button below.",
            "Sign in or create an account if the website asks you to do so.",
            "Select New and choose a blank document or a flowchart template.",
            "Place the first step at the top and add the remaining steps in order.",
            "Use arrows to show the direction and decision shapes where the path can change.",
        ],
        "account_note": EXTERNAL_ACCOUNT_NOTE,
        "paper_alternative": (
            "No account needed: write each step inside a box on paper and connect the boxes with arrows."
        ),
    },
    "cornell notes": {
        "title": "Cornell Notes",
        "emoji": "\U0001f4c4",
        "link": "https://www.evernote.com/",
        "link_text": "Open Evernote",
        "tool_name": "Evernote",
        "description": (
            "Cornell Notes separates detailed notes, review questions or key words, and a short "
            "summary. This structure supports both learning and later self-testing."
        ),
        "best_for": "Taking organised lesson notes and reviewing them with self-test questions.",
        "estimated_time": "During the lesson plus 5 minutes for the summary",
        "steps": [
            "Open Evernote using the button below.",
            "Sign in or create an account if the website asks you to do so.",
            "Create a new note and add the headings Notes, Questions or Key Words, and Summary.",
            "Write the main lesson details under Notes and add review questions beside them.",
            "After the lesson, write a short summary without copying the original notes.",
        ],
        "account_note": EXTERNAL_ACCOUNT_NOTE,
        "paper_alternative": (
            "No account needed: divide a notebook page into a narrow question column, a wide notes "
            "area, and a summary section at the bottom."
        ),
    },
}


def enrich_study_technique_payload(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    """Attach the latest static how-to guide without making another AI request."""
    if not isinstance(payload, dict):
        return payload

    enriched = dict(payload)
    enriched_rows: list[dict[str, Any]] = []
    for row in payload.get("techniques") or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("technique") or row.get("title") or "").strip().lower()
        details = TECHNIQUES.get(name)
        enriched_rows.append(
            {**row, **details, "technique": name} if details else dict(row)
        )
    enriched["techniques"] = enriched_rows
    return enriched
