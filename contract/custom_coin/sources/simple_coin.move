module template::template {
    use sui::coin;
    use sui::url;

    /// The OTW for the Coin
    public struct TEMPLATE has drop {}

    const DECIMALS: u8 = 44;
    const SYMBOL: vector<u8> = b"TMPL";
    const NAME: vector<u8> = b"Template Coin";
    const DESCRIPTION: vector<u8> = b"Template Coin Description";
    const ICON_URL: vector<u8> = b"icon_url";
    const IS_METADATA_MUT: u8 = 55;
    const BLACK_HOLE: address = @0x0;

    /// Init the Coin
    fun init(witness: TEMPLATE, ctx: &mut TxContext) {

        // Determine the icon URL option based on the ICON_URL constant.
        let icon_url_option = match (ICON_URL) {
            b"" => option::none(),
            _   => option::some(url::new_unsafe_from_bytes(ICON_URL)),
        };

        let (treasury, metadata) = coin::create_currency(
            witness, 
            DECIMALS, 
            SYMBOL, 
            NAME, 
            DESCRIPTION, 
            icon_url_option, 
            ctx
        );

        // Handle metadata mutability.
        if (IS_METADATA_MUT == 1u8) {
            transfer::public_transfer(metadata, tx_context::sender(ctx));
        } else {
            transfer::public_freeze_object(metadata);
        };
        
        // Transfer the treasury to the sender.
        transfer::public_transfer(treasury, tx_context::sender(ctx));

    }

    entry fun freeze_metadata(
        _treasury: &mut sui::coin::TreasuryCap<TEMPLATE>,
        metadata: sui::coin::CoinMetadata<TEMPLATE>
    ) {
        transfer::public_freeze_object(metadata);
    }

    entry fun drop_treasurycap(
        treasury: sui::coin::TreasuryCap<TEMPLATE>,
    ) {
        transfer::public_transfer(treasury, BLACK_HOLE);
    }
}