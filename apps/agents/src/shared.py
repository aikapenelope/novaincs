"""
Nova Agents — Shared components (guardrails, learning, compression).

Production-grade shared infrastructure for all Nova agents.
Same pattern as qyne-v1/app/shared.py.
"""

from agno.compression.manager import CompressionManager
from agno.learn.machine import LearningMachine
from agno.learn import (
    LearnedKnowledgeConfig,
    LearningMode,
    UserMemoryConfig,
    EntityMemoryConfig,
)

from .config import TOOL_MODEL, FAST_MODEL, learnings_knowledge

# ---------------------------------------------------------------------------
# Guardrails
# ---------------------------------------------------------------------------
# Nova handles merchant financial data (payment screenshots, bank details).
# PII detection masks sensitive data in agent context.

try:
    from agno.guardrails import PIIDetectionGuardrail, PromptInjectionGuardrail

    guardrails = [
        PIIDetectionGuardrail(
            mask_pii=True,
            enable_phone_check=False,  # Venezuelan phone numbers are part of normal flow
        ),
        PromptInjectionGuardrail(),
    ]
except ImportError:
    guardrails = []

# ---------------------------------------------------------------------------
# Learning Machines
# ---------------------------------------------------------------------------
# Agents learn from interactions and improve over time.
# Learnings are stored in LanceDB (nova_learnings table).

if learnings_knowledge is not None:
    # Minimal learning: only patterns and solutions.
    learning_minimal = LearningMachine(
        model=TOOL_MODEL,
        knowledge=learnings_knowledge,
        learned_knowledge=LearnedKnowledgeConfig(mode=LearningMode.AGENTIC),
    )

    # Full learning: user memory + entities + knowledge.
    learning_full = LearningMachine(
        model=TOOL_MODEL,
        knowledge=learnings_knowledge,
        user_memory=UserMemoryConfig(mode=LearningMode.AGENTIC),
        entity_memory=EntityMemoryConfig(mode=LearningMode.AGENTIC),
        learned_knowledge=LearnedKnowledgeConfig(mode=LearningMode.AGENTIC),
    )
else:
    learning_minimal = None  # type: ignore[assignment]
    learning_full = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Context Compression
# ---------------------------------------------------------------------------
# Compresses long tool results to save tokens and stay within context limits.

compression = CompressionManager(
    model=FAST_MODEL,
    compress_tool_results=True,
)

# Convenience alias
learning = learning_minimal
