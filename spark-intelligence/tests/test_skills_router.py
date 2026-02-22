from lib.skills_router import recommend_skills


def test_skills_router_ranks_relevant_skill():
    skills = [
        {
            "skill_id": "auth-specialist",
            "name": "auth-specialist",
            "description": "Authentication and OAuth flows",
            "owns": ["oauth", "tokens"],
            "delegates": [],
            "anti_patterns": [],
            "detection": [],
        },
        {
            "skill_id": "multi-agent-orchestration",
            "name": "multi-agent-orchestration",
            "description": "Coordination patterns for multiple agents",
            "owns": ["orchestration", "routing"],
            "delegates": ["agent-communication"],
            "anti_patterns": ["premature multi-agent"],
            "detection": [],
        },
    ]

    ranked = recommend_skills("agent orchestration routing", skills=skills, effectiveness={})
    assert ranked
    assert ranked[0]["skill_id"] == "multi-agent-orchestration"
