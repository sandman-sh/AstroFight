# AstroFight Anchor Scaffold

This folder contains the starter Anchor programs for AstroFight.

Included now:

- `astrofight_escrow`
  - `initialize_match` creates the escrow PDA and locks the creator stake
  - `join_match` locks the challenger stake
  - `settle_match` pays the full pool to the winner
  - `cancel_match` refunds both sides before the match is settled
- `astrofight_match_state`
  - owns the per-room `match-state` PDA used for realtime combat state
  - stores pilot snapshots, last shot data, match stage, winner, and room metadata
  - is the intended account owner for MagicBlock ER delegation in production

Important:

- A trusted or delegated match authority is still required to settle the winner. Pure on-chain verification of the off-chain realtime duel is out of scope for this scaffold.
- In a production MagicBlock deployment, the `match-state` PDA should be delegated into MagicBlock and updated through your authoritative match runtime or delegated game authority.
- The Rust files here are scaffolds. You still need a full Anchor workspace, IDs, and deployment wiring before devnet can use them live.
