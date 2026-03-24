"""Tests for dispute flow: dispute, evidence, resolution, refund."""
from conftest import CONTRACT_PATH, addr, create_and_accept, mock_sla_pass, mock_sla_fail


def test_dispute_milestone(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    result = contract.dispute_milestone("test-1", 0, "SLA not met")
    assert result is True

    ms = contract.get_milestone("test-1", 0)
    assert ms.status == 4  # DISPUTED
    assert ms.dispute_reason == "SLA not met"

    ag = contract.get_agreement("test-1")
    assert ag.status == 3  # DISPUTED


def test_dispute_unauthorized_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only client or provider can dispute"):
        contract.dispute_milestone("test-1", 0, "Bad")


def test_dispute_paid_milestone_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_alice

    for _ in range(3):
        direct_vm.clear_mocks()
        mock_sla_pass(direct_vm)
        contract.check_sla("test-1", 0)

    contract.verify_milestone("test-1", 0)
    contract.release_payment("test-1", 0)

    # Agreement is COMPLETED after paying all milestones, so dispute hits status check first
    with direct_vm.expect_revert("Agreement is not active"):
        contract.dispute_milestone("test-1", 0, "Too late")


def test_dispute_already_disputed_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "First dispute")

    with direct_vm.expect_revert("already disputed"):
        contract.dispute_milestone("test-1", 0, "Second dispute")


def test_submit_evidence(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "SLA failed")

    contract.submit_evidence("test-1", 0, "Client evidence: SLA checks failed 3 times")

    direct_vm.sender = direct_bob
    contract.submit_evidence("test-1", 0, "Provider evidence: service was operational")

    ms = contract.get_milestone("test-1", 0)
    assert "Client evidence" in ms.evidence_client
    assert "Provider evidence" in ms.evidence_provider


def test_submit_evidence_twice_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "SLA failed")
    contract.submit_evidence("test-1", 0, "First submission")

    with direct_vm.expect_revert("Client evidence already submitted"):
        contract.submit_evidence("test-1", 0, "Second submission")


def test_submit_evidence_unauthorized_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "SLA failed")

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only client or provider can submit"):
        contract.submit_evidence("test-1", 0, "Outsider evidence")


def test_resolve_dispute_party_a_fails_milestone(direct_vm, direct_deploy, direct_alice, direct_bob):
    """PARTY_A verdict = client wins = milestone FAILED."""
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "SLA failed")

    contract.resolve_dispute("test-1", 0, "PARTY_A", "0xCourtAddress")

    ms = contract.get_milestone("test-1", 0)
    assert ms.status == 5  # FAILED

    ag = contract.get_agreement("test-1")
    # Single milestone failed — all terminal -> COMPLETED
    assert ag.status == 2  # COMPLETED


def test_resolve_dispute_party_b_pays_milestone(direct_vm, direct_deploy, direct_alice, direct_bob):
    """PARTY_B verdict = provider wins = milestone PAID."""
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "SLA failed")

    contract.resolve_dispute("test-1", 0, "PARTY_B", "0xCourtAddress")

    ms = contract.get_milestone("test-1", 0)
    assert ms.status == 3  # PAID

    ag = contract.get_agreement("test-1")
    assert ag.status == 2  # COMPLETED


def test_resolve_dispute_undetermined_returns_to_monitoring(direct_vm, direct_deploy, direct_alice, direct_bob):
    """UNDETERMINED verdict on first dispute = back to MONITORING."""
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "Unclear SLA")

    contract.resolve_dispute("test-1", 0, "UNDETERMINED", "0xCourt")

    ms = contract.get_milestone("test-1", 0)
    assert ms.status == 1  # MONITORING (back to normal)

    ag = contract.get_agreement("test-1")
    assert ag.status == 1  # ACTIVE


def test_resolve_undetermined_second_time_fails_milestone(direct_vm, direct_deploy, direct_alice, direct_bob):
    """UNDETERMINED verdict on second dispute = milestone FAILED (dispute_count >= 2)."""
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice

    # First dispute -> UNDETERMINED -> back to monitoring
    contract.dispute_milestone("test-1", 0, "First dispute")
    contract.resolve_dispute("test-1", 0, "UNDETERMINED", "0xCourt1")

    # Second dispute -> UNDETERMINED -> FAILED
    contract.dispute_milestone("test-1", 0, "Second dispute")
    contract.resolve_dispute("test-1", 0, "UNDETERMINED", "0xCourt2")

    ms = contract.get_milestone("test-1", 0)
    assert ms.status == 5  # FAILED


def test_resolve_invalid_verdict_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "Bad")

    with direct_vm.expect_revert("Invalid verdict"):
        contract.resolve_dispute("test-1", 0, "INVALID", "0xCourt")


def test_multi_milestone_dispute_independence(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Two milestones can be disputed independently."""
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "multi-d", addr(direct_bob), "Multi dispute",
        "Check A|Check B",
        "https://a.com|https://b.com",
        "Crit A|Crit B",
        "100|200",
    )
    direct_vm.sender = direct_bob
    contract.accept_agreement("multi-d")

    direct_vm.sender = direct_alice

    # Dispute both
    contract.dispute_milestone("multi-d", 0, "A failed")
    contract.dispute_milestone("multi-d", 1, "B failed")

    ag = contract.get_agreement("multi-d")
    assert ag.status == 3  # DISPUTED

    # Resolve first -> still DISPUTED (second is still disputed)
    contract.resolve_dispute("multi-d", 0, "PARTY_A", "0xCourt")
    ag = contract.get_agreement("multi-d")
    assert ag.status == 3  # Still DISPUTED

    # Resolve second -> COMPLETED (all terminal)
    contract.resolve_dispute("multi-d", 1, "PARTY_B", "0xCourt")
    ag = contract.get_agreement("multi-d")
    assert ag.status == 2  # COMPLETED


def test_refund_failed_milestone(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "SLA failed")
    contract.resolve_dispute("test-1", 0, "PARTY_A", "0xCourt")

    # Milestone is now FAILED, client can refund
    result = contract.refund_failed_milestone("test-1", 0)
    assert result is True

    ms = contract.get_milestone("test-1", 0)
    assert ms.status == 6  # REFUNDED


def test_refund_non_failed_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only failed milestones can be refunded"):
        contract.refund_failed_milestone("test-1", 0)


def test_refund_only_client(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.dispute_milestone("test-1", 0, "Failed")
    contract.resolve_dispute("test-1", 0, "PARTY_A", "0xCourt")

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the client can request a refund"):
        contract.refund_failed_milestone("test-1", 0)
