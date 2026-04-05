use anchor_lang::prelude::*;

declare_id!("7k4vyWB43PQNUU2RVFsP8czAqhgV1Fv7w4e31AitM3FF");

#[program]
pub mod astrofight_match_state {
    use super::*;

    pub fn initialize_match_state(
        ctx: Context<InitializeMatchState>,
        room_code: String,
        player_one: Pubkey,
        player_two: Pubkey,
        stake_lamports: u64,
    ) -> Result<()> {
        require!(room_code.len() <= 16, MatchStateError::RoomCodeTooLong);
        require!(player_one != player_two, MatchStateError::DuplicatePilot);

        let state = &mut ctx.accounts.match_state;
        state.room_code = room_code;
        state.authority = ctx.accounts.authority.key();
        state.player_one = player_one;
        state.player_two = player_two;
        state.stake_lamports = stake_lamports;
        state.stage = MatchStage::Lobby;
        state.winner = Pubkey::default();
        state.end_reason = EndReason::Hp;
        state.match_started_at_ms = 0;
        state.updated_at_slot = Clock::get()?.slot;
        state.bump = ctx.bumps.match_state;

        state.player_one_state = PilotRuntimeState::default();
        state.player_two_state = PilotRuntimeState::default();
        state.last_shot = ShotRuntimeState::default();

        Ok(())
    }

    pub fn arm_match(ctx: Context<AuthorityMutatesMatchState>, start_time_ms: i64) -> Result<()> {
        let state = &mut ctx.accounts.match_state;
        state.stage = MatchStage::Live;
        state.match_started_at_ms = start_time_ms;
        state.updated_at_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn update_pilot_state(
        ctx: Context<UpdatePilotState>,
        pilot_index: u8,
        snapshot: PilotRuntimeState,
    ) -> Result<()> {
        require!(pilot_index <= 1, MatchStateError::InvalidPilotIndex);

        let state = &mut ctx.accounts.match_state;
        let signer = ctx.accounts.pilot.key();

        if pilot_index == 0 {
            require!(signer == state.player_one, MatchStateError::InvalidPilotSigner);
            state.player_one_state = snapshot;
        } else {
            require!(signer == state.player_two, MatchStateError::InvalidPilotSigner);
            state.player_two_state = snapshot;
        }

        state.updated_at_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn record_shot(
        ctx: Context<UpdatePilotState>,
        pilot_index: u8,
        shot: ShotRuntimeState,
    ) -> Result<()> {
        require!(pilot_index <= 1, MatchStateError::InvalidPilotIndex);

        let state = &mut ctx.accounts.match_state;
        let signer = ctx.accounts.pilot.key();
        let expected = if pilot_index == 0 {
            state.player_one
        } else {
            state.player_two
        };

        require!(signer == expected, MatchStateError::InvalidPilotSigner);

        state.last_shot = shot;
        state.updated_at_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn finish_match(
        ctx: Context<AuthorityMutatesMatchState>,
        winner: Pubkey,
        reason: EndReason,
    ) -> Result<()> {
        let state = &mut ctx.accounts.match_state;

        require!(
            winner == state.player_one || winner == state.player_two,
            MatchStateError::InvalidWinner
        );

        state.stage = MatchStage::Finished;
        state.winner = winner;
        state.end_reason = reason;
        state.updated_at_slot = Clock::get()?.slot;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(room_code: String)]
pub struct InitializeMatchState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: trusted match authority or arbiter service for the ER-backed MVP
    pub authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + MatchStateAccount::INIT_SPACE,
        seeds = [b"match-state", room_code.as_bytes()],
        bump
    )]
    pub match_state: Account<'info, MatchStateAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AuthorityMutatesMatchState<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority
    )]
    pub match_state: Account<'info, MatchStateAccount>,
}

#[derive(Accounts)]
pub struct UpdatePilotState<'info> {
    pub pilot: Signer<'info>,
    #[account(mut)]
    pub match_state: Account<'info, MatchStateAccount>,
}

#[account]
#[derive(InitSpace)]
pub struct MatchStateAccount {
    #[max_len(16)]
    pub room_code: String,
    pub authority: Pubkey,
    pub player_one: Pubkey,
    pub player_two: Pubkey,
    pub winner: Pubkey,
    pub stake_lamports: u64,
    pub stage: MatchStage,
    pub end_reason: EndReason,
    pub match_started_at_ms: i64,
    pub updated_at_slot: u64,
    pub player_one_state: PilotRuntimeState,
    pub player_two_state: PilotRuntimeState,
    pub last_shot: ShotRuntimeState,
    pub bump: u8,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    InitSpace,
    Clone,
    Copy,
    Default,
    PartialEq,
    Eq,
)]
pub struct PilotRuntimeState {
    pub pos_x: i16,
    pub pos_z: i16,
    pub velocity_x: i16,
    pub velocity_z: i16,
    pub rotation_bps: i16,
    pub health: u8,
    pub shield: u8,
    pub boost: u8,
    pub firing: bool,
    pub sequence: u64,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    InitSpace,
    Clone,
    Copy,
    Default,
    PartialEq,
    Eq,
)]
pub struct ShotRuntimeState {
    pub owner_index: u8,
    pub origin_x: i16,
    pub origin_z: i16,
    pub dir_x: i16,
    pub dir_z: i16,
    pub sequence: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq)]
pub enum MatchStage {
    Lobby,
    Live,
    Finished,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq)]
pub enum EndReason {
    Hp,
    Disconnect,
    Timeout,
}

#[error_code]
pub enum MatchStateError {
    #[msg("The room code is too long.")]
    RoomCodeTooLong,
    #[msg("Both pilots cannot be the same wallet.")]
    DuplicatePilot,
    #[msg("Pilot index must be 0 or 1.")]
    InvalidPilotIndex,
    #[msg("The signer does not match the requested pilot slot.")]
    InvalidPilotSigner,
    #[msg("Winner must be one of the two registered pilots.")]
    InvalidWinner,
}
