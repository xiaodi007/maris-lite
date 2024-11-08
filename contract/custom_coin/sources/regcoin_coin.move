module template::regtemplate {
    use sui::coin::{Self, DenyCapV2};
    use sui::deny_list::{DenyList};
    use sui::url;

    /// The OTW for the Coin
    public struct REGTEMPLATE has drop {}

    const DECIMALS: u8 = 44;
    const SYMBOL: vector<u8> = b"TMPL";
    const NAME: vector<u8> = b"Template Coin";
    const DESCRIPTION: vector<u8> = b"Template Coin Description";
    const ICON_URL: vector<u8> = b"icon_url";
    const IS_METADATA_MUT: u8 = 55;
    const BLACK_HOLE: address = @0x0;

    /// Init the Coin
    fun init(witness: REGTEMPLATE, ctx: &mut TxContext) {
        // Determine the icon URL option based on the ICON_URL constant.
        let icon_url_option = match (ICON_URL) {
            b"" => option::none(),
            _   => option::some(url::new_unsafe_from_bytes(ICON_URL)),
        };

        let (treasury, deny_cap, metadata) = coin::create_regulated_currency_v2(
            witness, 
            DECIMALS, 
            SYMBOL, 
            NAME, 
            DESCRIPTION, 
            icon_url_option, 
            false,
            ctx
        );

        // Handle metadata mutability.
        if (IS_METADATA_MUT == 1u8) {
            transfer::public_transfer(metadata, tx_context::sender(ctx));
        } else {
            transfer::public_freeze_object(metadata);
        };

        transfer::public_transfer(treasury, tx_context::sender(ctx));

        // Transfer the deny_cap to the sender.
        transfer::public_transfer(deny_cap, tx_context::sender(ctx));
    }

    entry fun freeze_metadata(
        _treasury: &mut sui::coin::TreasuryCap<REGTEMPLATE>,
        metadata: sui::coin::CoinMetadata<REGTEMPLATE>
    ) {
        transfer::public_freeze_object(metadata);
    }

    entry fun drop_treasurycap(
        treasury: sui::coin::TreasuryCap<REGTEMPLATE>,
    ) {
        transfer::public_transfer(treasury, BLACK_HOLE);
    }

    entry fun add_addr_from_deny_list(
        denylist: &mut DenyList,
        denycap: &mut DenyCapV2<REGTEMPLATE>,
        denyaddr: address,
        ctx: &mut TxContext,
    ) {
        coin::deny_list_v2_add(denylist, denycap, denyaddr, ctx);
    }

    entry fun remove_addr_from_deny_list(
        denylist: &mut DenyList,
        denycap: &mut DenyCapV2<REGTEMPLATE>,
        denyaddr: address,
        ctx: &mut TxContext,
    ) {
        coin::deny_list_v2_remove(denylist, denycap, denyaddr, ctx);
    }

    entry fun contain_addr_from_deny_list<REGTEMPLATE>(
        denylist: &DenyList,
        denyaddr: address,
        ctx: &TxContext,
    ) {
        coin::deny_list_v2_contains_current_epoch<REGTEMPLATE>(denylist, denyaddr, ctx);
    }
}