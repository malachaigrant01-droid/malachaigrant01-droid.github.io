// Asset universe. src: "crypto" (CoinGecko id + Coinbase product), "us" (Finnhub US symbol), "asx" (Finnhub .AX symbol).
// pop: curated popularity rank 1–5 (5 = most widely held). Live volume overrides it where a feed reports volume.
(function () {
  const C = (sym, name, cg, pop, cb) => ({ sym, name, src: "crypto", cg, cb: cb === false ? null : (cb || sym + "-USD"), pop });
  const U = (sym, name, pop, kind) => ({ sym, name, src: "us", pop, kind: kind || "Stock" });
  const A = (sym, name, pop, kind) => ({ sym, name, src: "asx", pop, kind: kind || "Stock" });

  const CATEGORIES = [
    {
      id: "property", name: "Property", blurb: "Listed property: REITs and A-REITs. Fractional exposure to buildings, data centres, warehouses and towers.",
      assets: [
        A("GMG", "Goodman Group", 5), A("SCG", "Scentre Group", 4), A("SGP", "Stockland", 4), A("VCX", "Vicinity Centres", 3),
        A("DXS", "Dexus", 3), A("CHC", "Charter Hall Group", 3), A("GPT", "GPT Group", 3), A("MGR", "Mirvac Group", 3),
        A("CQR", "Charter Hall Retail REIT", 2), A("CLW", "Charter Hall Long WALE REIT", 2), A("NSR", "National Storage REIT", 2),
        A("BWP", "BWP Trust", 2), A("HDN", "HomeCo Daily Needs REIT", 2), A("CIP", "Centuria Industrial REIT", 2),
        A("ARF", "Arena REIT", 2), A("INA", "Ingenia Communities", 2), A("VAP", "Vanguard Australian Property ETF", 4, "ETF"),
        A("SLF", "SPDR S&P/ASX 200 Listed Property ETF", 3, "ETF"), A("MVA", "VanEck Australian Property ETF", 2, "ETF"),
        A("REIT", "VanEck FTSE International Property ETF", 2, "ETF"),
        U("O", "Realty Income", 5), U("PLD", "Prologis", 5), U("AMT", "American Tower", 4), U("EQIX", "Equinix", 4),
        U("SPG", "Simon Property Group", 4), U("PSA", "Public Storage", 3), U("WELL", "Welltower", 3), U("DLR", "Digital Realty", 4),
        U("VICI", "VICI Properties", 4), U("CCI", "Crown Castle", 3), U("AVB", "AvalonBay Communities", 3), U("EQR", "Equity Residential", 3),
        U("EXR", "Extra Space Storage", 2), U("IRM", "Iron Mountain", 3), U("ARE", "Alexandria Real Estate", 2), U("MAA", "Mid-America Apartment", 2),
        U("INVH", "Invitation Homes", 2), U("SBAC", "SBA Communications", 2), U("VTR", "Ventas", 2), U("ESS", "Essex Property Trust", 2),
        U("KIM", "Kimco Realty", 2), U("REG", "Regency Centers", 2), U("UDR", "UDR Inc", 2), U("CPT", "Camden Property", 2),
        U("HST", "Host Hotels & Resorts", 2), U("FRT", "Federal Realty", 2), U("BXP", "BXP Inc", 2), U("NNN", "NNN REIT", 2),
        U("STAG", "STAG Industrial", 2), U("VNQ", "Vanguard Real Estate ETF", 5, "ETF"), U("XLRE", "Real Estate Select Sector SPDR", 3, "ETF"),
        U("SCHH", "Schwab US REIT ETF", 3, "ETF"), U("IYR", "iShares US Real Estate ETF", 3, "ETF"), U("RWR", "SPDR Dow Jones REIT ETF", 2, "ETF"),
        U("USRT", "iShares Core US REIT ETF", 2, "ETF"),
      ],
    },
    {
      id: "ai", name: "AI", blurb: "Chips, cloud, models and automation — plus AI ETFs and AI-network tokens.",
      assets: [
        U("NVDA", "NVIDIA", 5), U("MSFT", "Microsoft", 5), U("GOOGL", "Alphabet", 5), U("META", "Meta Platforms", 5),
        U("AMD", "Advanced Micro Devices", 5), U("AVGO", "Broadcom", 5), U("TSM", "Taiwan Semiconductor ADR", 5), U("PLTR", "Palantir", 5),
        U("ORCL", "Oracle", 4), U("CRM", "Salesforce", 4), U("IBM", "IBM", 3), U("SNOW", "Snowflake", 3), U("AI", "C3.ai", 3),
        U("PATH", "UiPath", 2), U("SMCI", "Super Micro Computer", 4), U("ARM", "Arm Holdings ADR", 4), U("MU", "Micron", 4),
        U("INTC", "Intel", 3), U("ADBE", "Adobe", 3), U("NOW", "ServiceNow", 3), U("DDOG", "Datadog", 3), U("MRVL", "Marvell", 3),
        U("ANET", "Arista Networks", 3), U("SOUN", "SoundHound AI", 3), U("BBAI", "BigBear.ai", 2), U("ASML", "ASML ADR", 4),
        U("QCOM", "Qualcomm", 3), U("CDNS", "Cadence Design", 2), U("SNPS", "Synopsys", 2), U("DELL", "Dell Technologies", 3),
        U("HPE", "Hewlett Packard Enterprise", 2), U("VRT", "Vertiv", 3), U("TEM", "Tempus AI", 2),
        U("BOTZ", "Global X Robotics & AI ETF", 3, "ETF"), U("ROBO", "ROBO Global Robotics ETF", 2, "ETF"),
        U("AIQ", "Global X AI & Technology ETF", 3, "ETF"), U("IRBO", "iShares Robotics & AI ETF", 2, "ETF"), U("SMH", "VanEck Semiconductor ETF", 4, "ETF"),
        A("RBTZ", "BetaShares Global Robotics & AI ETF", 2, "ETF"), A("WTC", "WiseTech Global", 3), A("NXT", "NEXTDC", 3),
        C("FET", "Artificial Superintelligence Alliance", "fetch-ai", 4), C("RENDER", "Render", "render-token", 4),
        C("TAO", "Bittensor", "bittensor", 4), C("WLD", "Worldcoin", "worldcoin-wld", 3, false), C("GRT", "The Graph", "the-graph", 3),
        C("AKT", "Akash Network", "akash-network", 2), C("OCEAN", "Ocean Protocol", "ocean-protocol", 2),
      ],
    },
    {
      id: "stocks", name: "Stocks", blurb: "Individual companies — US mega-caps and the ASX blue chips.",
      assets: [
        U("AAPL", "Apple", 5), U("AMZN", "Amazon", 5), U("TSLA", "Tesla", 5), U("BRK.B", "Berkshire Hathaway B", 4),
        U("JPM", "JPMorgan Chase", 4), U("V", "Visa", 4), U("MA", "Mastercard", 4), U("UNH", "UnitedHealth", 3),
        U("XOM", "Exxon Mobil", 3), U("JNJ", "Johnson & Johnson", 3), U("WMT", "Walmart", 4), U("PG", "Procter & Gamble", 3),
        U("HD", "Home Depot", 3), U("KO", "Coca-Cola", 4), U("PEP", "PepsiCo", 3), U("COST", "Costco", 4), U("DIS", "Disney", 4),
        U("NFLX", "Netflix", 4), U("NKE", "Nike", 3), U("MCD", "McDonald's", 3), U("BAC", "Bank of America", 3), U("CVX", "Chevron", 3),
        U("LLY", "Eli Lilly", 4), U("ABBV", "AbbVie", 3), U("MRK", "Merck", 3), U("PFE", "Pfizer", 3), U("CSCO", "Cisco", 3),
        U("T", "AT&T", 3), U("VZ", "Verizon", 3), U("BA", "Boeing", 3), U("CAT", "Caterpillar", 3), U("GE", "GE Aerospace", 3),
        U("UBER", "Uber", 4), U("SHOP", "Shopify", 4), U("PYPL", "PayPal", 3), U("XYZ", "Block", 3), U("COIN", "Coinbase", 4),
        U("HOOD", "Robinhood", 4), U("SPOT", "Spotify", 3), U("ABNB", "Airbnb", 3),
        A("BHP", "BHP Group", 5), A("CBA", "Commonwealth Bank", 5), A("CSL", "CSL", 4), A("NAB", "National Australia Bank", 4),
        A("WBC", "Westpac", 4), A("ANZ", "ANZ Group", 4), A("WES", "Wesfarmers", 4), A("MQG", "Macquarie Group", 4),
        A("WOW", "Woolworths Group", 3), A("FMG", "Fortescue", 4), A("TLS", "Telstra", 4), A("RIO", "Rio Tinto", 4),
        A("WDS", "Woodside Energy", 3), A("TCL", "Transurban", 3), A("ALL", "Aristocrat Leisure", 3), A("REA", "REA Group", 3),
        A("XRO", "Xero", 3), A("COL", "Coles Group", 3), A("JHX", "James Hardie", 2), A("STO", "Santos", 2), A("QBE", "QBE Insurance", 2),
        A("SUN", "Suncorp", 2), A("ORG", "Origin Energy", 2), A("NST", "Northern Star", 3), A("PLS", "Pilbara Minerals", 3), A("MIN", "Mineral Resources", 2),
      ],
    },
    {
      id: "shares", name: "Shares & ETFs", blurb: "Index funds and ETFs — one buy, hundreds of companies inside.",
      assets: [
        A("VAS", "Vanguard Australian Shares", 5, "ETF"), A("VGS", "Vanguard MSCI Intl Shares", 5, "ETF"), A("IVV", "iShares S&P 500", 5, "ETF"),
        A("NDQ", "BetaShares NASDAQ 100", 5, "ETF"), A("A200", "BetaShares Australia 200", 4, "ETF"), A("VDHG", "Vanguard Diversified High Growth", 4, "ETF"),
        A("DHHF", "BetaShares Diversified All Growth", 3, "ETF"), A("IOZ", "iShares Core S&P/ASX 200", 3, "ETF"), A("STW", "SPDR S&P/ASX 200", 3, "ETF"),
        A("VTS", "Vanguard US Total Market", 3, "ETF"), A("VEU", "Vanguard All-World ex-US", 2, "ETF"), A("QUAL", "VanEck MSCI World ex-AU Quality", 3, "ETF"),
        A("ETHI", "BetaShares Global Sustainability Leaders", 3, "ETF"), A("HACK", "BetaShares Global Cybersecurity", 2, "ETF"), A("ASIA", "BetaShares Asia Technology Tigers", 2, "ETF"),
        A("IOO", "iShares Global 100", 2, "ETF"), A("VGE", "Vanguard FTSE Emerging Markets", 2, "ETF"), A("VAF", "Vanguard Australian Fixed Interest", 2, "ETF"),
        A("GOLD", "Global X Physical Gold", 3, "ETF"), A("VHY", "Vanguard Australian High Yield", 3, "ETF"),
        U("SPY", "SPDR S&P 500 ETF", 5, "ETF"), U("VOO", "Vanguard S&P 500 ETF", 5, "ETF"), U("QQQ", "Invesco QQQ", 5, "ETF"),
        U("VTI", "Vanguard Total Stock Market", 5, "ETF"), U("VT", "Vanguard Total World Stock", 4, "ETF"), U("IWM", "iShares Russell 2000", 4, "ETF"),
        U("DIA", "SPDR Dow Jones Industrial", 3, "ETF"), U("SCHD", "Schwab US Dividend Equity", 4, "ETF"), U("VYM", "Vanguard High Dividend Yield", 3, "ETF"),
        U("ARKK", "ARK Innovation ETF", 3, "ETF"), U("GLD", "SPDR Gold Shares", 4, "ETF"), U("SLV", "iShares Silver Trust", 3, "ETF"),
        U("TLT", "iShares 20+ Year Treasury", 3, "ETF"), U("IBIT", "iShares Bitcoin Trust", 4, "ETF"),
      ],
    },
    {
      id: "crypto", name: "Crypto", blurb: "Digital assets, priced live around the clock. Highest volatility of any category here.",
      assets: [
        C("BTC", "Bitcoin", "bitcoin", 5), C("ETH", "Ethereum", "ethereum", 5), C("SOL", "Solana", "solana", 5),
        C("BNB", "BNB", "binancecoin", 4), C("XRP", "XRP", "ripple", 5), C("ADA", "Cardano", "cardano", 4),
        C("DOGE", "Dogecoin", "dogecoin", 4), C("AVAX", "Avalanche", "avalanche-2", 3), C("DOT", "Polkadot", "polkadot", 3),
        C("LINK", "Chainlink", "chainlink", 4), C("TRX", "TRON", "tron", 3, false), C("TON", "Toncoin", "the-open-network", 3, false),
        C("LTC", "Litecoin", "litecoin", 3), C("BCH", "Bitcoin Cash", "bitcoin-cash", 3), C("NEAR", "NEAR Protocol", "near", 3),
        C("UNI", "Uniswap", "uniswap", 3), C("ATOM", "Cosmos", "cosmos", 2), C("XLM", "Stellar", "stellar", 3),
        C("ETC", "Ethereum Classic", "ethereum-classic", 2), C("FIL", "Filecoin", "filecoin", 2), C("APT", "Aptos", "aptos", 2),
        C("ARB", "Arbitrum", "arbitrum", 2), C("OP", "Optimism", "optimism", 2), C("SUI", "Sui", "sui", 4),
        C("INJ", "Injective", "injective-protocol", 2), C("AAVE", "Aave", "aave", 3), C("HBAR", "Hedera", "hedera-hashgraph", 3),
        C("ICP", "Internet Computer", "internet-computer", 2), C("SHIB", "Shiba Inu", "shiba-inu", 3), C("PEPE", "Pepe", "pepe", 3),
        C("ALGO", "Algorand", "algorand", 2), C("VET", "VeChain", "vechain", 2, false), C("POL", "Polygon", "polygon-ecosystem-token", 2),
      ],
    },
  ];

  window.INVEST_CATEGORIES = CATEGORIES;
})();
