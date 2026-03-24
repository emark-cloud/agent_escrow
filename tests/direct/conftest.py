import json


CONTRACT_PATH = "contracts/agent_escrow.py"


def addr(raw_bytes: bytes) -> str:
    """Convert raw address bytes to 0x-prefixed hex string."""
    return "0x" + raw_bytes.hex()


def mock_sla_pass(direct_vm):
    """Mock web + LLM to produce a PASS SLA check."""
    direct_vm.mock_web(
        r".*",
        {"status": 200, "body": '{"status": "ok", "uptime": 99.9}'},
    )
    direct_vm.mock_llm(
        r".*",
        "PASS: Service meets all SLA criteria",
    )
    # Handle prompt_non_comparative's ExecPromptTemplate in direct mode
    def hook(vm, request):
        if isinstance(request, dict) and "ExecPromptTemplate" in request:
            return {"ok": "PASS: Service meets all SLA criteria"}
        return None
    direct_vm._gl_call_hook = hook


def mock_sla_fail(direct_vm):
    """Mock web + LLM to produce a FAIL SLA check."""
    direct_vm.mock_web(
        r".*",
        {"status": 200, "body": '{"status": "degraded"}'},
    )
    direct_vm.mock_llm(
        r".*",
        "FAIL: Service does not meet SLA criteria",
    )
    def hook(vm, request):
        if isinstance(request, dict) and "ExecPromptTemplate" in request:
            return {"ok": "FAIL: Service does not meet SLA criteria"}
        return None
    direct_vm._gl_call_hook = hook


def create_and_accept(direct_vm, direct_deploy, alice, bob, agreement_id="test-1"):
    """Helper: deploy contract, create agreement as alice, accept as bob."""
    contract = direct_deploy(CONTRACT_PATH)

    direct_vm.sender = alice
    contract.create_agreement(
        agreement_id,
        addr(bob),
        "Test agreement",
        "API uptime check",
        "https://api.example.com/health",
        "Response returns HTTP 200",
        "100",
    )

    direct_vm.sender = bob
    contract.accept_agreement(agreement_id)

    return contract
