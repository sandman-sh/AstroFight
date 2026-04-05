use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use astrofight_match_state::{EndReason, MatchStage, MatchStateAccount};

declare_id!("36jNz1GXXBV4DoXHETExtqHCawyw3sE9JhUNsn57BxAh");

#[program]
pub mod astrofight_escrow {
    use super::*;

    pub fn initialize_match(
        ctx: Context<InitializeMatch>,
        room_code: String,
        stake_lamports: u64,
    ) -> Result<()> {
        require!(room_code.len() <= 16, AstroFightError::RoomCodeTooLong);
        require!(stake_lamports > 0, AstroFightError::InvalidStake);

        let escrow = &mut ctx.accounts.match_escrow;
        escrow.creator = ctx.accounts.creator.key();
        escrow.opponent = Pubkey::default();
        escrow.winner = Pubkey::default();
        escrow.arbiter = ctx.accounts.arbiter.key();
        escrow.room_code = room_code;
        escrow.stake_lamports = stake_lamports;
        escrow.status = MatchStatus::WaitingForOpponent;
        escrow.bump = ctx.bumps.match_escrow;

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.match_escrow.to_account_info(),
                },
            ),
            stake_lamports,
        )?;

        Ok(())
    }

    pub fn join_match(ctx: Context<JoinMatch>) -> Result<()> {
        let stake_lamports = {
            let escrow = &ctx.accounts.match_escrow;

            require!(
                escrow.status == MatchStatus::WaitingForOpponent,
                AstroFightError::MatchUnavailable
            );
            require!(
                escrow.opponent == Pubkey::default(),
                AstroFightError::OpponentAlreadyJoined
            );

            escrow.stake_lamports
        };

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.opponent.to_account_info(),
                    to: ctx.accounts.match_escrow.to_account_info(),
                },
            ),
            stake_lamports,
        )?;

        let escrow = &mut ctx.accounts.match_escrow;
        escrow.opponent = ctx.accounts.opponent.key();
        escrow.status = MatchStatus::Live;

        Ok(())
    }

    pub fn settle_match(
        ctx: Context<SettleMatch>,
        winner: Pubkey,
        disconnect_win: bool,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.match_escrow;
        let match_state = &ctx.accounts.match_state;

        require!(escrow.status == MatchStatus::Live, AstroFightError::MatchUnavailable);
        require!(
            winner == escrow.creator || winner == escrow.opponent,
            AstroFightError::InvalidWinner
        );
        require!(
            match_state.authority == ctx.accounts.arbiter.key(),
            AstroFightError::InvalidMatchAuthority
        );
        require!(
            match_state.room_code == escrow.room_code,
            AstroFightError::RoomCodeMismatch
        );
        require!(
            match_state.player_one == escrow.creator && match_state.player_two == escrow.opponent,
            AstroFightError::PilotMismatch
        );
        require!(
            match_state.stake_lamports == escrow.stake_lamports,
            AstroFightError::StakeMismatch
        );
        require!(
            match_state.stage == MatchStage::Finished,
            AstroFightError::MatchStateNotFinished
        );
        require!(
            match_state.winner == winner,
            AstroFightError::WinnerMismatch
        );
        require!(
            disconnect_win == (match_state.end_reason == EndReason::Disconnect),
            AstroFightError::ResultReasonMismatch
        );

        escrow.status = MatchStatus::Settled;
        escrow.winner = winner;

        let total_pool = escrow.stake_lamports.checked_mul(2).unwrap();
        let escrow_info = escrow.to_account_info();
        let winner_info = ctx.accounts.winner.to_account_info();

        **escrow_info.try_borrow_mut_lamports()? -= total_pool;
        **winner_info.try_borrow_mut_lamports()? += total_pool;

        msg!(
            "AstroFight settled. Winner: {}, disconnect win: {}",
            winner,
            disconnect_win
        );

        Ok(())
    }

    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        let escrow = &mut ctx.accounts.match_escrow;

        require!(
            escrow.status == MatchStatus::WaitingForOpponent,
            AstroFightError::CannotCancel
        );

        let escrow_info = escrow.to_account_info();
        let creator_info = ctx.accounts.creator.to_account_info();

        **escrow_info.try_borrow_mut_lamports()? -= escrow.stake_lamports;
        **creator_info.try_borrow_mut_lamports()? += escrow.stake_lamports;

        escrow.status = MatchStatus::Cancelled;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(room_code: String)]
pub struct InitializeMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: trusted settlement authority for the MVP scaffold
    pub arbiter: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + MatchEscrow::INIT_SPACE,
        seeds = [b"match", creator.key().as_ref(), room_code.as_bytes()],
        bump
    )]
    pub match_escrow: Account<'info, MatchEscrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(mut)]
    pub opponent: Signer<'info>,
    #[account(mut)]
    pub match_escrow: Account<'info, MatchEscrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMatch<'info> {
    #[account(mut)]
    pub arbiter: Signer<'info>,
    #[account(
        mut,
        has_one = arbiter
    )]
    pub match_escrow: Account<'info, MatchEscrow>,
    pub match_state: Account<'info, MatchStateAccount>,
    /// CHECK: validated against stored creator/opponent pubkeys
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator
    )]
    pub match_escrow: Account<'info, MatchEscrow>,
}

#[account]
#[derive(InitSpace)]
pub struct MatchEscrow {
    pub creator: Pubkey,
    pub opponent: Pubkey,
    pub winner: Pubkey,
    pub arbiter: Pubkey,
    #[max_len(16)]
    pub room_code: String,
    pub stake_lamports: u64,
    pub status: MatchStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum MatchStatus {
    WaitingForOpponent,
    Live,
    Settled,
    Cancelled,
}

#[error_code]
pub enum AstroFightError {
    #[msg("The room code is too long.")]
    RoomCodeTooLong,
    #[msg("Stake must be greater than zero.")]
    InvalidStake,
    #[msg("This match is unavailable.")]
    MatchUnavailable,
    #[msg("An opponent already joined this match.")]
    OpponentAlreadyJoined,
    #[msg("The supplied winner is not part of this match.")]
    InvalidWinner,
    #[msg("The match-state authority does not match the escrow arbiter.")]
    InvalidMatchAuthority,
    #[msg("The match-state room code does not match the escrow room.")]
    RoomCodeMismatch,
    #[msg("The match-state pilots do not match the escrow participants.")]
    PilotMismatch,
    #[msg("The match-state stake does not match the escrow stake.")]
    StakeMismatch,
    #[msg("The match-state account is not finished yet.")]
    MatchStateNotFinished,
    #[msg("The settled winner does not match the finished match-state winner.")]
    WinnerMismatch,
    #[msg("The supplied end reason does not match the finished match-state result.")]
    ResultReasonMismatch,
    #[msg("This match can no longer be cancelled.")]
    CannotCancel,
}
