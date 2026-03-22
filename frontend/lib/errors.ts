export interface UserFriendlyError {
  title: string;
  message: string;
  action?: string;
}

export function mapToUserFriendlyError(error: unknown): UserFriendlyError {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes("User rejected") || msg.includes("user rejected")) {
    return {
      title: "Transaction Cancelled",
      message: "You rejected the transaction in your wallet.",
      action: "Try again when ready.",
    };
  }

  if (msg.includes("insufficient funds")) {
    return {
      title: "Insufficient Balance",
      message: "Your wallet doesn't have enough GEN tokens.",
      action: "Get tokens from the faucet.",
    };
  }

  if (msg.includes("Agreement not found")) {
    return {
      title: "Not Found",
      message: "This agreement doesn't exist.",
    };
  }

  if (msg.includes("Only the provider")) {
    return {
      title: "Wrong Account",
      message: "Only the provider can perform this action.",
      action: "Switch to the provider wallet.",
    };
  }

  if (msg.includes("Only the client")) {
    return {
      title: "Wrong Account",
      message: "Only the client can perform this action.",
      action: "Switch to the client wallet.",
    };
  }

  if (msg.includes("not active")) {
    return {
      title: "Agreement Not Active",
      message: "This agreement must be active to perform this action.",
    };
  }

  if (msg.includes("Could not find GenLayer transaction ID")) {
    return {
      title: "Transaction Failed on Chain",
      message: "The transaction reverted. This can happen if gas was too low. Try again.",
      action: "Resubmit the transaction.",
    };
  }

  if (msg.includes("Leader timed out")) {
    return {
      title: "Validator Timeout",
      message: "The lead validator timed out. This is a testnet issue.",
      action: "Resubmit the transaction.",
    };
  }

  if (msg.includes("Transaction failed on chain")) {
    return {
      title: "Transaction Failed",
      message: "The transaction was rejected by validators.",
      action: "Try again.",
    };
  }

  return {
    title: "Something went wrong",
    message: msg.length > 200 ? msg.slice(0, 200) + "..." : msg,
  };
}
