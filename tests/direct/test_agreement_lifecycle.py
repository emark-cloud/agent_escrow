"""Tests for the full agreement lifecycle: create, accept, cancel."""
from conftest import CONTRACT_PATH, addr


def test_create_agreement(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    result = contract.create_agreement(
        "deal-1",
        addr(direct_bob),
        "API monitoring service",
        "Uptime check",
        "https://api.example.com/health",
        "Must return HTTP 200",
        "100",
    )
    assert result is True

    ag = contract.get_agreement("deal-1")
    assert ag.agreement_id == "deal-1"
    assert ag.description == "API monitoring service"
    assert ag.status == 0  # CREATED
    assert ag.milestone_count == 1
    assert ag.total_amount == 100


def test_create_multi_milestone(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    contract.create_agreement(
        "deal-multi",
        addr(direct_bob),
        "Multi-milestone deal",
        "Check A|Check B|Check C",
        "https://a.com|https://b.com|https://c.com",
        "Criteria A|Criteria B|Criteria C",
        "100|200|300",
    )

    ag = contract.get_agreement("deal-multi")
    assert ag.milestone_count == 3
    assert ag.total_amount == 600

    ms0 = contract.get_milestone("deal-multi", 0)
    assert ms0.description == "Check A"
    assert ms0.amount == 100

    ms2 = contract.get_milestone("deal-multi", 2)
    assert ms2.description == "Check C"
    assert ms2.amount == 300


def test_create_duplicate_id_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    contract.create_agreement(
        "dup-1", addr(direct_bob), "First", "desc", "url", "crit", "10"
    )

    with direct_vm.expect_revert("Agreement ID already exists"):
        contract.create_agreement(
            "dup-1", addr(direct_bob), "Second", "desc", "url", "crit", "10"
        )


def test_create_invalid_id_characters(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    for bad_id in ["deal:1", "deal|1", "deal,1"]:
        with direct_vm.expect_revert("must not contain"):
            contract.create_agreement(
                bad_id, addr(direct_bob), "Bad", "desc", "url", "crit", "10"
            )


def test_create_same_client_provider_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Client and provider cannot be the same"):
        contract.create_agreement(
            "self-deal", addr(direct_alice), "Self", "desc", "url", "crit", "10"
        )


def test_create_empty_milestone_fields_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Empty milestone fields"):
        contract.create_agreement(
            "empty-1", addr(direct_bob), "Bad", "", "url", "crit", "10"
        )


def test_create_zero_amount_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Milestone amount must be greater than zero"):
        contract.create_agreement(
            "zero-1", addr(direct_bob), "Bad", "desc", "url", "crit", "0"
        )


def test_create_mismatched_milestone_fields_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Milestone field counts do not match"):
        contract.create_agreement(
            "mismatch", addr(direct_bob), "Bad",
            "desc1|desc2", "url1", "crit1|crit2", "10|20"
        )


def test_accept_agreement(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "accept-1", addr(direct_bob), "Test", "desc", "url", "crit", "50"
    )

    direct_vm.sender = direct_bob
    result = contract.accept_agreement("accept-1")
    assert result is True

    ag = contract.get_agreement("accept-1")
    assert ag.status == 1  # ACTIVE

    ms = contract.get_milestone("accept-1", 0)
    assert ms.status == 1  # MONITORING


def test_accept_wrong_party_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "wrong-1", addr(direct_bob), "Test", "desc", "url", "crit", "50"
    )

    # Alice (client) tries to accept — should fail
    with direct_vm.expect_revert("Only the provider can accept"):
        contract.accept_agreement("wrong-1")


def test_accept_already_active_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "double-1", addr(direct_bob), "Test", "desc", "url", "crit", "50"
    )
    direct_vm.sender = direct_bob
    contract.accept_agreement("double-1")

    with direct_vm.expect_revert("not in CREATED state"):
        contract.accept_agreement("double-1")


def test_cancel_agreement(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "cancel-1", addr(direct_bob), "Test", "desc", "url", "crit", "50"
    )

    contract.cancel_agreement("cancel-1")
    ag = contract.get_agreement("cancel-1")
    assert ag.status == 4  # CANCELLED


def test_cancel_only_client(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "cancel-2", addr(direct_bob), "Test", "desc", "url", "crit", "50"
    )

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the client can cancel"):
        contract.cancel_agreement("cancel-2")


def test_cancel_after_acceptance_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "cancel-3", addr(direct_bob), "Test", "desc", "url", "crit", "50"
    )
    direct_vm.sender = direct_bob
    contract.accept_agreement("cancel-3")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Can only cancel before acceptance"):
        contract.cancel_agreement("cancel-3")


def test_agreement_not_found_reverts(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("Agreement not found"):
        contract.get_agreement("nonexistent")


def test_get_all_agreement_ids(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice

    contract.create_agreement("id-a", addr(direct_bob), "A", "d", "u", "c", "10")
    contract.create_agreement("id-b", addr(direct_bob), "B", "d", "u", "c", "20")

    ids = contract.get_all_agreement_ids()
    assert "id-a" in ids
    assert "id-b" in ids
    assert contract.get_agreement_count() == 2
