import asyncio
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("adapter", Path(__file__).with_name("service.py"))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class FakeProvider:
    def __init__(self, *_args, **_kwargs): self.closed = False
    async def aclose(self): self.closed = True


class FakeAnswer:
    choice = "SHORT"
    probabilities = {"NO_TRADE": 0.1, "LONG": 0.2, "SHORT": 0.7}
    confidence = 0.6


class FakeClient:
    def __init__(self, **kwargs): self.kwargs = kwargs
    async def system_one(self, state, questions):
        self.state, self.questions = state, questions
        return type("Response", (), {
            "model": "claude-test",
            "answers": {next(iter(questions)): FakeAnswer()},
            "usage": type("Usage", (), {"input_tokens": 3, "output_tokens": 4,
              "latency": .001, "n_retries": 0, "n_retries_malformed_structure": 0})(),
        })()


class AdapterTests(unittest.TestCase):
    def payload(self):
        return {"state": {"symbol": "BTCUSDT"}, "questions": {"entry_x": {
            "type": "choice", "instructions": "decide", "criteria": {
                "NO_TRADE": "no", "LONG": {"sl": 1}, "SHORT": {"tp": 1}
            }}}}

    def test_uses_official_adapter_with_native_schema(self):
        result = asyncio.run(adapter.evaluate_payload(self.payload(), client_type=FakeClient, provider_type=FakeProvider))
        self.assertEqual(result["answers"]["entry_x"]["choice"], "SHORT")
        self.assertEqual(result["usage"]["retries"], 0)

    def test_rejects_unexpected_question_shapes(self):
        for questions in ({}, {"a": {"type": "noul", "criteria": {}}}, {"a": {"type": "choice", "criteria": {"LONG": None}}}):
            with self.assertRaises(ValueError): adapter.build_questions(questions)


if __name__ == "__main__":
    unittest.main()
