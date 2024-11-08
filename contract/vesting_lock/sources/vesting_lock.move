/*
/// Module: vesting_lock
*/

module vesting_lock::vesting_lock {
    use sui::coin::{Self, Coin, into_balance};
    use std::string;
    use sui::tx_context::sender;
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use std::type_name;
    use sui::event::emit;
    use sui::transfer::{share_object, public_transfer};
 
    const EAlreadyClaimed: u64 = 1; // Already claimed
    fun err_already_claimed() { abort EAlreadyClaimed }

    const ENotInRecipient: u64 = 2; // Not in the recipient
    fun err_not_in_recipient() { abort ENotInRecipient }

    const ELocked: u64 = 3; // Still in the lock-up period
    fun err_locked() { abort ELocked }

    const ENoAvailableAmount: u64 = 4; // No available amount to confirm
    fun err_no_available_amount() { abort ENoAvailableAmount }

    const ENotSender: u64 = 5; // Only the sender can terminate
    fun err_not_sender() { abort ENotSender }

    // const EAlreadyWithdrawn: u64 = 6; // Already fully withdrawn
    // fun err_already_withdrawn() { abort EAlreadyWithdrawn }

    const ENonRefundable: u64 = 7; // Non-refundable
    fun err_non_refundable() { abort ENonRefundable }

    const ECliffDateBeforeStartDate: u64 = 8; // The cliff date must be later than the start date
    fun err_cliff_date_before_start_date() { abort ECliffDateBeforeStartDate }

    const EFinalDateBeforeCliffDate: u64 = 9; // The final date must be later than the cliff date
    fun err_final_date_before_cliff_date() { abort EFinalDateBeforeCliffDate }

    const EFinalDateBeforeStartDate: u64 = 10; // The final date must be later than the cliff date
    fun err_final_date_before_start_date() { abort EFinalDateBeforeStartDate }

    const EAmountIsZero: u64 = 11;    // Amount must be greater than zero
    fun err_amount_is_zero() { abort EAmountIsZero }

    const EInvalidInterval: u64 = 12; // Invalid interval duration
    fun err_invalid_interval() { abort EInvalidInterval }

    // Objects
    public struct Locker<phantom T> has key, store {
        id: UID,
        title: string::String,
        description: Option<string::String>,
        locker_type: string::String,
        claim_type: string::String,
        start_timestamp_ms: u64,
        cliff_timestamp_ms: Option<u64>,
        final_timestamp_ms: u64,
        token_type: string::String,
        original_balance: u64,
        current_balance: Balance<T>,
        revocable: bool,
        sender: address,
        recipient: address,
        interval_duration_ms: u64,
    }

    // --------------- Events ---------------

    public struct NewLocker<phantom T> has copy, drop {
        lock_id: ID,
        token_type: string::String,
        locker_type: string::String,
        claim_type: string::String,
        sender: address,
        amount: u64,
        
    }

    public struct ClaimLocker<phantom T> has copy, drop {
        lock_id: ID,
        token_type: string::String,
        locker_type: string::String,
        claim_type: string::String,
        claimer: address,
        amount: u64,
    }

    public struct RefundLocker<phantom T> has copy, drop {
        lock_id: ID,
        token_type: string::String,
        locker_type: string::String,
        claim_type: string::String,
        refunder: address,
        amount: u64,
    }
    // --------------- Helper ---------------
    /// Helper function to get the coin type string
    fun get_token_type_string<T>(): string::String {
        let coin_type = type_name::get<T>();
        string::from_ascii(*type_name::borrow_string(&coin_type))
    }


    /// Computes the total vested amount based on the custom interval duration
    fun compute_vested_amount<T>(locker: &Locker<T>, clock: &Clock): u64 {
        let current_time = clock::timestamp_ms(clock);

        if (current_time >= locker.final_timestamp_ms) {
            // All tokens have vested
            locker.original_balance
        } else if (current_time < locker.start_timestamp_ms) {
            // No tokens have vested yet
            0
        } else {
            let elapsed_duration = current_time - locker.start_timestamp_ms;
            let total_duration = locker.final_timestamp_ms - locker.start_timestamp_ms;

            // Calculate total intervals
            let total_intervals = if ((total_duration % locker.interval_duration_ms) == 0) {
                total_duration / locker.interval_duration_ms
            } else {
                (total_duration / locker.interval_duration_ms) + 1 // Include partial interval
            };

            // Calculate elapsed intervals
            let elapsed_intervals = elapsed_duration / locker.interval_duration_ms;

            // Handle any remainder intervals
            let vested_intervals = if (elapsed_intervals >= total_intervals) {
                total_intervals
            } else {
                elapsed_intervals
            };

            // Calculate vested amount
            // To avoid overflow and ensure accurate calculations, 
            // adjust the calculation order by dividing first and then multiplying
            //This way, both amount_per_interval and vested_intervals are smaller numbers, 
            //so their product will not overflow.
            locker.original_balance  / total_intervals * vested_intervals
        }
    }

     /// Creates a new locker with a customizable interval duration
     entry fun new_lock<T>(
        title: string::String,
        description: Option<string::String>,
        locker_type: string::String,
        claim_type: string::String,
        start_timestamp_ms: u64,
        cliff_timestamp_ms: Option<u64>,
        final_timestamp_ms: u64,
        coin_amount: Coin<T>, 
        revocable: bool,
        recipient: address,
        interval_duration_ms: u64,
        ctx: &mut TxContext) {

        if(option::is_none(&cliff_timestamp_ms)) {
            if (start_timestamp_ms >= final_timestamp_ms) {
                err_final_date_before_start_date();
            }
        } else {
            let cliff_timestamp_ms_value = option::borrow(&cliff_timestamp_ms);
            if (start_timestamp_ms > *cliff_timestamp_ms_value) {
                err_cliff_date_before_start_date();
            };
            if ( *cliff_timestamp_ms_value > final_timestamp_ms) {
                err_final_date_before_cliff_date();
            }
        };

        // Validate interval_duration_ms
        let total_duration = final_timestamp_ms - start_timestamp_ms;
        if ((interval_duration_ms == 0) || (interval_duration_ms > total_duration)) {
            err_invalid_interval();
        };
        
        let amount = coin_amount.value();
        if (amount < 0) {
            err_amount_is_zero();
        };

        let sender = tx_context::sender(ctx);
        let _id = object::new(ctx);
        let lock_id = object::uid_to_inner(&_id);
        let token_type_string = get_token_type_string<T>();

        emit(NewLocker<T> {
            lock_id,
            token_type: token_type_string,
            locker_type: locker_type,
            claim_type: claim_type,
            sender,
            amount,
        });

        let locker = Locker<T> {
            id: _id,
            title: title,
            description: description,
            locker_type: locker_type,
            claim_type: claim_type,
            start_timestamp_ms: start_timestamp_ms,
            cliff_timestamp_ms: cliff_timestamp_ms,
            final_timestamp_ms: final_timestamp_ms,
            original_balance: amount,
            token_type: token_type_string,
            current_balance: into_balance(coin_amount),
            revocable: revocable,
            sender: sender,
            recipient: recipient,
            interval_duration_ms: interval_duration_ms,
        };

        if (revocable) {
            share_object(locker);
        } else { 
            public_transfer(locker, recipient);
         };
    }

    /// Claims the available vested amount based on the custom interval schedule
    entry fun claim_vested<T>(locker: &mut Locker<T>, clock: &Clock, ctx: &mut TxContext){

        if(!option::is_none(&locker.cliff_timestamp_ms)) {
            let cliff_timestamp_ms_value = option::borrow(&locker.cliff_timestamp_ms);
            if (clock::timestamp_ms(clock) < *cliff_timestamp_ms_value) {
                err_locked();
            }
        };

        let sender = sender(ctx);
        if (locker.recipient != sender) {
            err_not_in_recipient();
        };
        if (!(locker.original_balance > 0)) {
            err_already_claimed();
        };

        let total_vested_amount = compute_vested_amount(locker, clock);
        let amount_already_claimed = locker.original_balance - balance::value(&locker.current_balance);

        let available_vested_amount = if (total_vested_amount > amount_already_claimed) {
            total_vested_amount - amount_already_claimed
        } else {
            0
        };

        if (!(available_vested_amount > 0)) {
            err_no_available_amount();
        };


        let token_type_string = get_token_type_string<T>();

        emit(ClaimLocker<T>{
            lock_id: object::uid_to_inner(&locker.id),
            token_type: token_type_string,
            locker_type: locker.locker_type,
            claim_type: locker.claim_type,
            claimer: sender,
            amount: available_vested_amount,
        });

        transfer::public_transfer(
            coin::take(&mut locker.current_balance, available_vested_amount, ctx), 
            sender,
        );
    }

    /// Refunds the remaining balance to the sender if the locker is revocable
    entry fun refund_locker<T>(locker: &mut Locker<T>, ctx: &mut TxContext){
        let sender = sender(ctx);

        if (locker.sender != sender) {
            err_not_sender();
        };
        if (!locker.revocable) {
            err_non_refundable();
        };

        let available_vested_amount = balance::value(&locker.current_balance);
        let token_type_string = get_token_type_string<T>();

        emit(RefundLocker<T> {
            lock_id: object::uid_to_inner(&locker.id),
            token_type: token_type_string,
            locker_type: locker.locker_type,
            claim_type: locker.claim_type,
            refunder: sender,
            amount: available_vested_amount,
        });
        transfer::public_transfer(coin::take(&mut locker.current_balance, available_vested_amount, ctx), locker.sender);
    }
}