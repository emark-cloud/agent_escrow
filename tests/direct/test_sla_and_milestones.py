"""Tests for SLA checks, milestone verification, and payment release."""
from conftest import CONTRACT_PATH, addr, create_and_accept, mock_sla_pass, mock_sla_fail


def test_sla_check_pass(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    mock_sla_pass(direct_vm)
    direct_vm.sender = direct_alice
    result = contract.check_sla("test-1", 0)
    assert result.upper().startswith("PASS")

    ms = contract.get_milestone("test-1", 0)
    assert ms.pass_count == 1
    assert ms.fail_count == 0


def test_sla_check_fail(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    mock_sla_fail(direct_vm)
    direct_vm.sender = direct_alice
    result = contract.check_sla("test-1", 0)
    assert result.upper().startswith("FAIL")

    ms = contract.get_milestone("test-1", 0)
    assert ms.pass_count == 0
    assert ms.fail_count == 1


def test_sla_check_unauthorized_reverts(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    mock_sla_pass(direct_vm)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only client or provider"):
        contract.check_sla("test-1", 0)


def test_sla_check_not_active_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "not-active", addr(direct_bob), "Test", "desc", "url", "crit", "50"
    )

    mock_sla_pass(direct_vm)
    with direct_vm.expect_revert("Agreement is not active"):
        contract.check_sla("not-active", 0)


def test_multiple_sla_checks_accumulate(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_alice

    # 2 passes
    for _ in range(2):
        direct_vm.clear_mocks()
        mock_sla_pass(direct_vm)
        contract.check_sla("test-1", 0)

    # 1 fail
    direct_vm.clear_mocks()
    mock_sla_fail(direct_vm)
    contract.check_sla("test-1", 0)

    ms = contract.get_milestone("test-1", 0)
    assert ms.pass_count == 2
    assert ms.fail_count == 1


def test_verify_milestone_after_checks(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_alice

    # Run 3 passing checks (minimum required)
    for _ in range(3):
        direct_vm.clear_mocks()
        mock_sla_pass(direct_vm)
        contract.check_sla("test-1", 0)

    result = contract.verify_milestone("test-1", 0)
    assert result is True

    ms = contract.get_milestone("test-1", 0)
    assert ms.status == 2  # VERIFIED


def test_verify_insufficient_checks_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_alice

    # Only 2 checks — need 3
    for _ in range(2):
        direct_vm.clear_mocks()
        mock_sla_pass(direct_vm)
        contract.check_sla("test-1", 0)

    with direct_vm.expect_revert("Need at least 3 checks"):
        contract.verify_milestone("test-1", 0)


def test_verify_majority_fails_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_alice

    # 1 pass, 2 fails — majority fails
    direct_vm.clear_mocks()
    mock_sla_pass(direct_vm)
    contract.check_sla("test-1", 0)

    for _ in range(2):
        direct_vm.clear_mocks()
        mock_sla_fail(direct_vm)
        contract.check_sla("test-1", 0)

    with direct_vm.expect_revert("not passed majority"):
        contract.verify_milestone("test-1", 0)


def test_release_payment(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_alice

    for _ in range(3):
        direct_vm.clear_mocks()
        mock_sla_pass(direct_vm)
        contract.check_sla("test-1", 0)

    contract.verify_milestone("test-1", 0)
    result = contract.release_payment("test-1", 0)
    assert result is True

    ms = contract.get_milestone("test-1", 0)
    assert ms.status == 3  # PAID

    # Single milestone — agreement should be COMPLETED
    ag = contract.get_agreement("test-1")
    assert ag.status == 2  # COMPLETED


def test_release_only_client(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_alice

    for _ in range(3):
        direct_vm.clear_mocks()
        mock_sla_pass(direct_vm)
        contract.check_sla("test-1", 0)

    contract.verify_milestone("test-1", 0)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the client can release"):
        contract.release_payment("test-1", 0)


def test_release_unverified_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = create_and_accept(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Milestone must be verified"):
        contract.release_payment("test-1", 0)


def test_full_happy_path_multi_milestone(direct_vm, direct_deploy, direct_alice, direct_bob):
    """End-to-end: create with 2 milestones, check, verify, pay both -> COMPLETED."""
    contract = direct_deploy(CONTRACT_PATH)

    direct_vm.sender = direct_alice
    contract.create_agreement(
        "multi-1", addr(direct_bob), "Multi test",
        "Check A|Check B",
        "https://a.com|https://b.com",
        "Criteria A|Criteria B",
        "100|200",
    )

    direct_vm.sender = direct_bob
    contract.accept_agreement("multi-1")

    direct_vm.sender = direct_alice

    # Process both milestones
    for ms_idx in range(2):
        for _ in range(3):
            direct_vm.clear_mocks()
            mock_sla_pass(direct_vm)
            contract.check_sla("multi-1", ms_idx)
        contract.verify_milestone("multi-1", ms_idx)
        contract.release_payment("multi-1", ms_idx)

    ag = contract.get_agreement("multi-1")
    assert ag.status == 2  # COMPLETED
