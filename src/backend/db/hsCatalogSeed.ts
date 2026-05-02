/**
 * Core AHTN 2022 HS Catalog Seed Data — Philippines Customs Calculator
 *
 * Coverage: all 21 sections, chapters 01-97, ~430 key subheadings.
 * Codes are at the HS 6-digit (XXXX.XX) level unless an 8-digit AHTN
 * distinction is needed. Chapter/section metadata is auto-populated via
 * getHsCodeMetadata() at seed time.
 */
import { getHsCodeMetadata } from '../../shared/hsLookupQuery'

export type HSCatalogRawEntry = {
  code: string
  description: string
  category: string
}

// prettier-ignore
const RAW_CATALOG: readonly HSCatalogRawEntry[] = [

  // ── SECTION I: Live Animals; Animal Products (Ch 01–05) ─────────────────

  // Ch 01: Live animals
  { code: '0101.21', description: 'Pure-bred breeding horses', category: 'Live Animals' },
  { code: '0102.29', description: 'Other live bovine animals', category: 'Live Animals' },
  { code: '0103.91', description: 'Live swine, weighing less than 50 kg', category: 'Live Animals' },
  { code: '0105.11', description: "Live fowls of Gallus domesticus, not exceeding 185 g", category: 'Live Animals' },

  // Ch 02: Meat and edible meat offal
  { code: '0201.10', description: 'Carcasses and half-carcasses of bovine animals, fresh or chilled', category: 'Meat & Poultry' },
  { code: '0201.30', description: 'Boneless beef, fresh or chilled', category: 'Meat & Poultry' },
  { code: '0202.10', description: 'Carcasses and half-carcasses of bovine animals, frozen', category: 'Meat & Poultry' },
  { code: '0202.30', description: 'Boneless beef, frozen', category: 'Meat & Poultry' },
  { code: '0203.11', description: 'Carcasses and half-carcasses of swine, fresh or chilled', category: 'Meat & Poultry' },
  { code: '0203.29', description: 'Other meat of swine, frozen', category: 'Meat & Poultry' },
  { code: '0207.11', description: 'Whole chicken, not cut in pieces, fresh or chilled', category: 'Meat & Poultry' },
  { code: '0207.12', description: 'Whole chicken, not cut in pieces, frozen', category: 'Meat & Poultry' },
  { code: '0207.13', description: 'Chicken cuts and offal, fresh or chilled', category: 'Meat & Poultry' },
  { code: '0207.14', description: 'Chicken meat, frozen', category: 'Meat & Poultry' },

  // Ch 03: Fish and aquatic invertebrates
  { code: '0302.41', description: 'Albacore or longfinned tunas, fresh or chilled', category: 'Fish & Seafood' },
  { code: '0303.41', description: 'Albacore or longfinned tunas, frozen', category: 'Fish & Seafood' },
  { code: '0304.62', description: 'Tilapia fillets, frozen', category: 'Fish & Seafood' },
  { code: '0304.89', description: 'Other fish fillets, frozen', category: 'Fish & Seafood' },
  { code: '0306.17', description: 'Other shrimps and prawns, frozen', category: 'Fish & Seafood' },
  { code: '0307.43', description: 'Cuttlefish and squid, frozen', category: 'Fish & Seafood' },

  // Ch 04: Dairy produce, eggs, honey
  { code: '0401.10', description: 'Milk and cream, not concentrated, fat content not exceeding 1%', category: 'Dairy & Eggs' },
  { code: '0401.20', description: 'Milk and cream, not concentrated, fat content 1%–6%', category: 'Dairy & Eggs' },
  { code: '0402.10', description: 'Milk powder, fat content not exceeding 1.5%', category: 'Dairy & Eggs' },
  { code: '0402.21', description: 'Milk powder, fat content exceeding 1.5%, not sweetened', category: 'Dairy & Eggs' },
  { code: '0404.10', description: 'Whey and modified whey', category: 'Dairy & Eggs' },
  { code: '0406.10', description: 'Fresh cheese (unripened or uncured)', category: 'Dairy & Eggs' },
  { code: '0406.20', description: 'Grated or powdered cheese', category: 'Dairy & Eggs' },
  { code: '0406.90', description: 'Other cheese', category: 'Dairy & Eggs' },
  { code: '0407.11', description: 'Fertilised eggs for incubation, poultry', category: 'Dairy & Eggs' },
  { code: '0409.00', description: 'Natural honey', category: 'Dairy & Eggs' },

  // Ch 05: Other animal products
  { code: '0511.91', description: 'Other animal products, not elsewhere specified', category: 'Live Animals' },

  // ── SECTION II: Vegetable Products (Ch 06–14) ───────────────────────────

  // Ch 06: Live plants
  { code: '0601.10', description: 'Dormant bulbs, tubers and tuberous roots for planting', category: 'Plants & Flowers' },
  { code: '0602.10', description: 'Unrooted cuttings and slips', category: 'Plants & Flowers' },
  { code: '0603.11', description: 'Fresh roses', category: 'Plants & Flowers' },

  // Ch 07: Edible vegetables
  { code: '0701.10', description: 'Seed potatoes', category: 'Vegetables' },
  { code: '0701.90', description: 'Other potatoes, fresh or chilled', category: 'Vegetables' },
  { code: '0702.00', description: 'Tomatoes, fresh or chilled', category: 'Vegetables' },
  { code: '0703.10', description: 'Onions and shallots, fresh or chilled', category: 'Vegetables' },
  { code: '0704.10', description: 'Cauliflowers and broccoli, fresh or chilled', category: 'Vegetables' },
  { code: '0713.31', description: 'Dried beans of Vigna mungo or Vigna radiata', category: 'Vegetables' },
  { code: '0714.10', description: 'Manioc (cassava), fresh, chilled or frozen', category: 'Vegetables' },

  // Ch 08: Edible fruit and nuts
  { code: '0801.11', description: 'Desiccated coconut', category: 'Fruits & Nuts' },
  { code: '0801.12', description: 'Coconut, in inner shell (endocarp)', category: 'Fruits & Nuts' },
  { code: '0801.19', description: 'Coconuts, other (fresh)', category: 'Fruits & Nuts' },
  { code: '0803.10', description: 'Plantains, fresh', category: 'Fruits & Nuts' },
  { code: '0803.90', description: 'Bananas, fresh or dried', category: 'Fruits & Nuts' },
  { code: '0804.10', description: 'Dates, fresh or dried', category: 'Fruits & Nuts' },
  { code: '0804.50', description: 'Guavas, mangoes and mangosteens, fresh or dried', category: 'Fruits & Nuts' },
  { code: '0805.10', description: 'Oranges, fresh or dried', category: 'Fruits & Nuts' },
  { code: '0806.10', description: 'Fresh grapes', category: 'Fruits & Nuts' },
  { code: '0808.10', description: 'Apples, fresh', category: 'Fruits & Nuts' },

  // Ch 09: Coffee, tea, spices
  { code: '0901.11', description: 'Coffee, not roasted, not decaffeinated', category: 'Coffee & Tea' },
  { code: '0901.21', description: 'Coffee, roasted, not decaffeinated', category: 'Coffee & Tea' },
  { code: '0902.10', description: 'Green tea, not fermented, not flavoured', category: 'Coffee & Tea' },
  { code: '0902.30', description: 'Black tea and partly fermented tea, in packages ≤ 3 kg', category: 'Coffee & Tea' },
  { code: '0904.21', description: 'Dried sweet pepper (Capsicum annuum), neither crushed nor ground', category: 'Spices' },
  { code: '0910.11', description: 'Ginger, neither crushed nor ground', category: 'Spices' },

  // Ch 10: Cereals
  { code: '1001.11', description: 'Durum wheat, seed', category: 'Grains & Cereals' },
  { code: '1001.99', description: 'Other wheat and meslin', category: 'Grains & Cereals' },
  { code: '1005.10', description: 'Maize (corn) seed', category: 'Grains & Cereals' },
  { code: '1005.90', description: 'Maize (corn), other', category: 'Grains & Cereals' },
  { code: '1006.10', description: 'Rice in the husk (paddy or rough)', category: 'Grains & Cereals' },
  { code: '1006.20', description: 'Husked (brown) rice', category: 'Grains & Cereals' },
  { code: '1006.30', description: 'Semi-milled or wholly milled rice', category: 'Grains & Cereals' },
  { code: '1006.40', description: 'Broken rice', category: 'Grains & Cereals' },
  { code: '1007.10', description: 'Grain sorghum, seed', category: 'Grains & Cereals' },

  // Ch 11: Milling products
  { code: '1101.00', description: 'Wheat or meslin flour', category: 'Flour & Starch' },
  { code: '1102.20', description: 'Maize (corn) flour', category: 'Flour & Starch' },
  { code: '1108.11', description: 'Wheat starch', category: 'Flour & Starch' },
  { code: '1108.12', description: 'Maize (corn) starch', category: 'Flour & Starch' },

  // Ch 12: Oil seeds
  { code: '1201.10', description: 'Soya beans, seed', category: 'Oil Seeds' },
  { code: '1201.90', description: 'Soya beans, other', category: 'Oil Seeds' },
  { code: '1203.00', description: 'Copra', category: 'Oil Seeds' },
  { code: '1207.40', description: 'Sesame seeds', category: 'Oil Seeds' },
  { code: '1211.20', description: 'Ginseng roots, fresh or dried', category: 'Medicinal Plants' },

  // Ch 13: Lac, gums, resins
  { code: '1301.20', description: 'Shellac', category: 'Gums & Resins' },

  // Ch 14: Vegetable plaiting materials
  { code: '1401.20', description: 'Rattan', category: 'Vegetable Materials' },

  // ── SECTION III: Animal or Vegetable Fats and Oils (Ch 15) ─────────────

  { code: '1507.10', description: 'Crude soya-bean oil', category: 'Oils & Fats' },
  { code: '1511.10', description: 'Crude palm oil', category: 'Oils & Fats' },
  { code: '1511.90', description: 'Other palm oil and its fractions', category: 'Oils & Fats' },
  { code: '1513.11', description: 'Crude coconut (copra) oil', category: 'Oils & Fats' },
  { code: '1513.19', description: 'Other coconut (copra) oil', category: 'Oils & Fats' },
  { code: '1516.20', description: 'Hydrogenated or partly hydrogenated vegetable fats and oils', category: 'Oils & Fats' },
  { code: '1517.10', description: 'Margarine, excluding liquid margarine', category: 'Oils & Fats' },

  // ── SECTION IV: Prepared Foodstuffs; Beverages; Tobacco (Ch 16–24) ──────

  // Ch 16: Preparations of meat, fish
  { code: '1601.00', description: 'Sausages and similar products of meat, offal or blood', category: 'Processed Food' },
  { code: '1602.32', description: 'Prepared or preserved poultry of heading 01.05 (chicken)', category: 'Processed Food' },
  { code: '1604.14', description: 'Prepared or preserved tunas and skipjack, whole or in pieces', category: 'Canned Food' },
  { code: '1604.20', description: 'Other prepared or preserved fish', category: 'Canned Food' },
  { code: '1605.21', description: 'Shrimps and prawns, not in airtight containers', category: 'Canned Food' },

  // Ch 17: Sugar
  { code: '1701.12', description: 'Beet sugar, raw, in solid form', category: 'Sugar & Confectionery' },
  { code: '1701.13', description: 'Cane sugar, raw, for evaluation under preference scheme', category: 'Sugar & Confectionery' },
  { code: '1701.14', description: 'Cane sugar, raw, other', category: 'Sugar & Confectionery' },
  { code: '1701.91', description: 'Refined sugar, containing added flavouring or colouring matter', category: 'Sugar & Confectionery' },
  { code: '1701.99', description: 'Other refined cane or beet sugar', category: 'Sugar & Confectionery' },
  { code: '1702.30', description: 'Glucose and glucose syrup, not containing fructose', category: 'Sugar & Confectionery' },

  // Ch 18: Cocoa
  { code: '1801.00', description: 'Cocoa beans, whole or broken, raw or roasted', category: 'Cocoa & Chocolate' },
  { code: '1804.00', description: 'Cocoa butter, fat and oil', category: 'Cocoa & Chocolate' },
  { code: '1806.20', description: 'Other chocolate and food preparations containing cocoa, in blocks > 2 kg', category: 'Cocoa & Chocolate' },
  { code: '1806.32', description: 'Chocolate, not filled, in tablets, bars or sticks', category: 'Cocoa & Chocolate' },

  // Ch 19: Preparations of cereals, flour
  { code: '1901.10', description: 'Preparations for infant use, put up for retail sale', category: 'Prepared Food' },
  { code: '1901.20', description: 'Mixes and doughs for the preparation of bakers\' wares', category: 'Prepared Food' },
  { code: '1902.11', description: 'Pasta, uncooked, not stuffed, containing eggs', category: 'Prepared Food' },
  { code: '1902.30', description: 'Other pasta', category: 'Prepared Food' },
  { code: '1904.10', description: 'Prepared cereals obtained by swelling or roasting', category: 'Prepared Food' },
  { code: '1905.31', description: 'Sweet biscuits', category: 'Snacks & Biscuits' },
  { code: '1905.90', description: 'Other bread, pastry, cakes, biscuits and other bakers\' wares', category: 'Snacks & Biscuits' },

  // Ch 20: Preparations of vegetables, fruit
  { code: '2002.10', description: 'Whole or in pieces tomatoes, prepared or preserved', category: 'Preserved Food' },
  { code: '2007.10', description: 'Homogenised preparations of fruit or nuts', category: 'Preserved Food' },
  { code: '2009.11', description: 'Orange juice, frozen', category: 'Juices' },
  { code: '2009.61', description: 'Grape juice, unfermented, Brix value not exceeding 30', category: 'Juices' },

  // Ch 21: Miscellaneous edible preparations
  { code: '2101.11', description: 'Extracts, essences and concentrates of coffee', category: 'Beverages' },
  { code: '2101.20', description: 'Extracts, essences and concentrates of tea or maté', category: 'Beverages' },
  { code: '2103.20', description: 'Tomato ketchup and other tomato sauces', category: 'Condiments' },
  { code: '2103.90', description: 'Other sauces and preparations; condiments and seasonings', category: 'Condiments' },
  { code: '2106.10', description: 'Protein concentrates and textured protein substances', category: 'Food Additives' },
  { code: '2106.90', description: 'Other food preparations, not elsewhere specified', category: 'Food Additives' },

  // Ch 22: Beverages, spirits
  { code: '2201.10', description: 'Mineral waters and aerated waters, not sweetened', category: 'Beverages' },
  { code: '2202.10', description: 'Waters, including mineral, flavoured, sweetened', category: 'Beverages' },
  { code: '2203.00', description: 'Beer made from malt', category: 'Alcoholic Beverages' },
  { code: '2204.21', description: 'Wine of fresh grapes, in containers of 2 litres or less', category: 'Alcoholic Beverages' },
  { code: '2208.20', description: 'Spirits obtained by distilling grape wine or grape marc (brandy)', category: 'Alcoholic Beverages' },
  { code: '2208.30', description: 'Whiskies', category: 'Alcoholic Beverages' },
  { code: '2208.40', description: 'Rum and other spirits obtained by fermenting sugar-cane products', category: 'Alcoholic Beverages' },
  { code: '2208.60', description: 'Vodka', category: 'Alcoholic Beverages' },

  // Ch 23: Food industry residues
  { code: '2301.10', description: 'Flours, meals and pellets of meat or offal; greaves', category: 'Animal Feed' },
  { code: '2302.30', description: 'Bran, sharps and other residues of wheat', category: 'Animal Feed' },
  { code: '2304.00', description: 'Oilcake and other solid residues from extraction of soya-bean oil', category: 'Animal Feed' },
  { code: '2309.10', description: 'Dog or cat food, put up for retail sale', category: 'Pet Food' },
  { code: '2309.90', description: 'Other preparations used in animal feeding', category: 'Animal Feed' },

  // Ch 24: Tobacco and manufactured tobacco substitutes
  { code: '2401.10', description: 'Tobacco, not stemmed/stripped', category: 'Tobacco' },
  { code: '2402.20', description: 'Cigarettes containing tobacco', category: 'Tobacco' },
  { code: '2403.11', description: 'Water pipe tobacco', category: 'Tobacco' },
  { code: '2404.11', description: 'Products intended for inhalation without combustion (heated tobacco)', category: 'Tobacco' },
  { code: '2404.12', description: 'Nicotine-containing products for oral use (e-liquids)', category: 'Tobacco' },

  // ── SECTION V: Mineral Products (Ch 25–27) ──────────────────────────────

  // Ch 25: Salt, stone, cement
  { code: '2501.00', description: 'Salt (including table salt and denatured salt) and pure sodium chloride', category: 'Minerals' },
  { code: '2507.00', description: 'Kaolin and other kaolinic clays', category: 'Minerals' },
  { code: '2515.11', description: 'Marble and travertine, crude or roughly trimmed', category: 'Stone' },
  { code: '2516.11', description: 'Granite, crude or roughly trimmed', category: 'Stone' },
  { code: '2523.21', description: 'White Portland cement', category: 'Construction Materials' },
  { code: '2523.29', description: 'Other Portland cement', category: 'Construction Materials' },
  { code: '2525.10', description: 'Crude mica and mica rifted into sheets or splittings', category: 'Minerals' },

  // Ch 26: Ores, slag and ash
  { code: '2601.11', description: 'Non-agglomerated iron ores and concentrates', category: 'Ores & Metals' },
  { code: '2603.00', description: 'Copper ores and concentrates', category: 'Ores & Metals' },
  { code: '2608.00', description: 'Zinc ores and concentrates', category: 'Ores & Metals' },
  { code: '2616.10', description: 'Silver ores and concentrates', category: 'Ores & Metals' },

  // Ch 27: Mineral fuels, mineral oils
  { code: '2701.11', description: 'Anthracite coal', category: 'Fuels & Energy' },
  { code: '2701.12', description: 'Bituminous coal', category: 'Fuels & Energy' },
  { code: '2709.00', description: 'Crude petroleum oils and oils obtained from bituminous minerals', category: 'Fuels & Energy' },
  { code: '2710.12', description: 'Light petroleum distillates (motor spirit/gasoline)', category: 'Fuels & Energy' },
  { code: '2710.19', description: 'Other petroleum oils, including aviation fuel and kerosene', category: 'Fuels & Energy' },
  { code: '2711.11', description: 'Liquefied natural gas (LNG)', category: 'Fuels & Energy' },
  { code: '2711.12', description: 'Propane, liquefied', category: 'Fuels & Energy' },
  { code: '2711.13', description: 'Butanes, liquefied', category: 'Fuels & Energy' },
  { code: '2711.21', description: 'Natural gas, in gaseous state', category: 'Fuels & Energy' },
  { code: '2716.00', description: 'Electrical energy', category: 'Fuels & Energy' },

  // ── SECTION VI: Products of Chemical or Allied Industries (Ch 28–38) ────

  // Ch 28: Inorganic chemicals
  { code: '2804.10', description: 'Hydrogen', category: 'Chemicals' },
  { code: '2804.61', description: 'Silicon, containing ≥ 99.99% by weight of silicon', category: 'Chemicals' },
  { code: '2807.00', description: 'Sulphuric acid; oleum', category: 'Chemicals' },
  { code: '2814.10', description: 'Anhydrous ammonia', category: 'Chemicals' },

  // Ch 29: Organic chemicals
  { code: '2902.20', description: 'Benzene', category: 'Organic Chemicals' },
  { code: '2905.11', description: 'Methanol (methyl alcohol)', category: 'Organic Chemicals' },
  { code: '2905.45', description: 'Glycerol', category: 'Organic Chemicals' },
  { code: '2915.21', description: 'Acetic acid', category: 'Organic Chemicals' },

  // Ch 30: Pharmaceutical products
  { code: '3002.13', description: 'Immunological products, unmixed, in measured doses or put up for retail', category: 'Pharmaceuticals' },
  { code: '3002.41', description: 'Vaccines for human medicine', category: 'Pharmaceuticals' },
  { code: '3002.42', description: 'Vaccines for veterinary medicine', category: 'Pharmaceuticals' },
  { code: '3004.10', description: 'Medicaments containing penicillin or derivatives, for retail sale', category: 'Pharmaceuticals' },
  { code: '3004.20', description: 'Medicaments containing antibiotics (other than penicillin), for retail sale', category: 'Pharmaceuticals' },
  { code: '3004.32', description: 'Medicaments containing corticosteroid hormones, for retail sale', category: 'Pharmaceuticals' },
  { code: '3004.50', description: 'Medicaments containing vitamins or provitamins, for retail sale', category: 'Pharmaceuticals' },
  { code: '3004.90', description: 'Other medicaments, for retail sale', category: 'Pharmaceuticals' },
  { code: '3005.10', description: 'Adhesive dressings and other articles with adhesive layer, for retail', category: 'Medical Supplies' },
  { code: '3006.10', description: 'Sterile surgical catgut, sutures and similar sterile suture materials', category: 'Medical Supplies' },

  // Ch 31: Fertilizers
  { code: '3101.00', description: 'Animal or vegetable fertilisers, whether or not mixed', category: 'Fertilizers' },
  { code: '3102.10', description: 'Urea, whether or not in aqueous solution', category: 'Fertilizers' },
  { code: '3104.20', description: 'Potassium chloride', category: 'Fertilizers' },
  { code: '3105.20', description: 'Mineral or chemical fertilisers containing nitrogen, phosphorus and potassium', category: 'Fertilizers' },

  // Ch 32: Tanning/dyeing extracts, paints and varnishes
  { code: '3204.17', description: 'Synthetic organic pigments', category: 'Dyes & Pigments' },
  { code: '3208.20', description: 'Paints and varnishes based on acrylic or vinyl polymers', category: 'Paints & Coatings' },
  { code: '3209.10', description: 'Paints and varnishes based on acrylic or vinyl polymers, water-based', category: 'Paints & Coatings' },
  { code: '3210.00', description: 'Other paints and varnishes; prepared water pigments for leather finishing', category: 'Paints & Coatings' },

  // Ch 33: Essential oils, perfumes, cosmetics
  { code: '3301.29', description: 'Essential oils, other than citrus', category: 'Cosmetics' },
  { code: '3303.00', description: 'Perfumes and toilet waters', category: 'Cosmetics' },
  { code: '3304.10', description: 'Lip make-up preparations', category: 'Cosmetics' },
  { code: '3304.20', description: 'Eye make-up preparations', category: 'Cosmetics' },
  { code: '3304.99', description: 'Other beauty or make-up preparations', category: 'Cosmetics' },
  { code: '3305.10', description: 'Shampoos', category: 'Personal Care' },
  { code: '3305.30', description: 'Hair lacquers', category: 'Personal Care' },
  { code: '3306.10', description: 'Dentifrices (toothpaste)', category: 'Personal Care' },
  { code: '3307.10', description: 'Pre-shave, shaving or after-shave preparations', category: 'Personal Care' },
  { code: '3307.20', description: 'Personal deodorants and antiperspirants', category: 'Personal Care' },

  // Ch 34: Soap, waxes, cleaning preparations
  { code: '3401.11', description: 'Soap for toilet use', category: 'Cleaning Products' },
  { code: '3401.20', description: 'Soap in other forms', category: 'Cleaning Products' },
  { code: '3402.31', description: 'Preparations for washing and cleaning, put up for retail sale', category: 'Cleaning Products' },

  // Ch 36: Explosives
  { code: '3603.00', description: 'Safety fuses; detonating fuses; percussion or detonating caps', category: 'Explosives' },

  // Ch 38: Miscellaneous chemical products
  { code: '3808.61', description: 'Goods in forms for retail as insecticides (mosquito coils, sprays)', category: 'Agrochemicals' },
  { code: '3808.92', description: 'Fungicides', category: 'Agrochemicals' },
  { code: '3808.93', description: 'Herbicides, anti-sprouting products and plant-growth regulators', category: 'Agrochemicals' },
  { code: '3824.99', description: 'Other chemical preparations and products, not elsewhere specified', category: 'Industrial Chemicals' },

  // ── SECTION VII: Plastics and Rubber (Ch 39–40) ─────────────────────────

  // Ch 39: Plastics
  { code: '3901.10', description: 'Polyethylene of specific gravity < 0.94 (LDPE, primary forms)', category: 'Plastics' },
  { code: '3901.20', description: 'Polyethylene of specific gravity ≥ 0.94 (HDPE, primary forms)', category: 'Plastics' },
  { code: '3902.10', description: 'Polypropylene, in primary forms', category: 'Plastics' },
  { code: '3903.11', description: 'Expansible polystyrene, in primary forms', category: 'Plastics' },
  { code: '3904.10', description: 'Poly(vinyl chloride), not mixed with other substances', category: 'Plastics' },
  { code: '3907.30', description: 'Epoxide resins, in primary forms', category: 'Plastics' },
  { code: '3907.61', description: 'Poly(ethylene terephthalate), viscosity number ≥ 78 ml/g (PET bottle grade)', category: 'Plastics' },
  { code: '3917.32', description: 'Other flexible tubes, pipes and hoses of plastics', category: 'Plastics' },
  { code: '3919.10', description: 'Self-adhesive plates, sheets, tape of plastics, in rolls ≤ 20 cm', category: 'Plastics' },
  { code: '3923.10', description: 'Boxes, cases, crates and similar articles for the conveyance of goods, of plastics', category: 'Plastic Products' },
  { code: '3923.21', description: 'Sacks and bags of polymers of ethylene', category: 'Plastic Products' },
  { code: '3923.30', description: 'Carboys, bottles, flasks and similar articles of plastics', category: 'Plastic Products' },
  { code: '3924.10', description: 'Tableware and kitchenware of plastics', category: 'Plastic Products' },
  { code: '3926.90', description: 'Other articles of plastics', category: 'Plastic Products' },

  // Ch 40: Rubber
  { code: '4001.10', description: 'Natural rubber latex, whether or not prevulcanised', category: 'Rubber' },
  { code: '4001.21', description: 'Natural rubber, smoked sheets (RSS)', category: 'Rubber' },
  { code: '4002.11', description: 'Styrene-butadiene rubber (SBR), latex', category: 'Rubber' },
  { code: '4011.10', description: 'New pneumatic tyres of rubber, for motor cars', category: 'Tyres' },
  { code: '4011.20', description: 'New pneumatic tyres of rubber, for buses or lorries', category: 'Tyres' },
  { code: '4011.40', description: 'New pneumatic tyres of rubber, for motorcycles', category: 'Tyres' },
  { code: '4016.99', description: 'Other articles of vulcanised rubber, not elsewhere specified', category: 'Rubber Products' },

  // ── SECTION VIII: Raw Hides, Leather, Travel Goods (Ch 41–43) ──────────

  { code: '4107.11', description: 'Full grains, unsplit, bovine leather', category: 'Leather' },
  { code: '4202.11', description: 'Trunks, suit-cases and vanity-cases with outer surface of leather or composition leather', category: 'Luggage & Bags' },
  { code: '4202.21', description: 'Handbags, with outer surface of leather or of composition leather', category: 'Luggage & Bags' },
  { code: '4203.10', description: 'Articles of apparel of leather or of composition leather', category: 'Leather Goods' },

  // ── SECTION IX: Wood and Articles of Wood; Cork (Ch 44–46) ─────────────

  { code: '4407.10', description: 'Wood sawn or chipped lengthwise, conifers, thickness > 6 mm', category: 'Wood Products' },
  { code: '4407.21', description: 'Dark Red Meranti, Light Red Meranti and Meranti Bakau', category: 'Wood Products' },
  { code: '4412.31', description: 'Plywood, at least one outer ply of non-coniferous tropical wood', category: 'Wood Products' },
  { code: '4418.90', description: 'Other builders\' joinery and carpentry of wood', category: 'Wood Products' },
  { code: '4419.11', description: 'Bread boards, chopping boards and similar articles of bamboo', category: 'Wood Products' },
  { code: '4421.91', description: 'Other articles of bamboo', category: 'Wood Products' },

  // ── SECTION X: Pulp, Paper and Printed Matter (Ch 47–49) ───────────────

  { code: '4801.00', description: 'Newsprint, in rolls or sheets', category: 'Paper' },
  { code: '4804.11', description: 'Unbleached kraft paper, in rolls or sheets', category: 'Paper' },
  { code: '4819.10', description: 'Cartons, boxes and cases of corrugated paper or paperboard', category: 'Packaging' },
  { code: '4820.10', description: 'Registers, account books, note books, diaries of paper or paperboard', category: 'Stationery' },
  { code: '4901.10', description: 'Books, brochures and similar printed matter, in single sheets', category: 'Books & Print' },
  { code: '4902.10', description: 'Daily newspapers, published at least 4 times per week', category: 'Books & Print' },

  // ── SECTION XI: Textiles and Textile Articles (Ch 50–63) ────────────────

  // Ch 52: Cotton
  { code: '5201.00', description: 'Cotton, not carded or combed', category: 'Textiles' },
  { code: '5208.11', description: 'Plain weave cotton fabric, unbleached, ≤ 100 g/m²', category: 'Textiles' },
  { code: '5209.11', description: 'Plain weave cotton fabric, unbleached, > 200 g/m²', category: 'Textiles' },

  // Ch 54: Man-made filaments
  { code: '5402.11', description: 'High tenacity yarn of nylon or other polyamides', category: 'Textiles' },
  { code: '5402.47', description: 'Other yarn of polyesters, partially oriented', category: 'Textiles' },

  // Ch 55: Man-made staple fibres
  { code: '5503.20', description: 'Polyester staple fibres, not carded or combed', category: 'Textiles' },

  // Ch 61: Articles of apparel (knitted)
  { code: '6105.10', description: "Men's shirts of cotton, knitted or crocheted", category: 'Apparel' },
  { code: '6106.10', description: "Women's blouses of cotton, knitted or crocheted", category: 'Apparel' },
  { code: '6109.10', description: 'T-shirts, singlets and other vests of cotton, knitted', category: 'Apparel' },
  { code: '6110.20', description: 'Jerseys, pullovers, sweatshirts of cotton, knitted', category: 'Apparel' },
  { code: '6111.20', description: 'Babies\' garments and clothing accessories of cotton, knitted', category: 'Apparel' },

  // Ch 62: Articles of apparel (not knitted)
  { code: '6203.11', description: "Men's suits of wool or fine animal hair", category: 'Apparel' },
  { code: '6203.22', description: "Men's ensembles of cotton, not knitted", category: 'Apparel' },
  { code: '6203.42', description: "Men's trousers and shorts of synthetic fibres, not knitted", category: 'Apparel' },
  { code: '6204.11', description: "Women's suits of wool or fine animal hair, not knitted", category: 'Apparel' },
  { code: '6204.62', description: "Women's trousers and shorts of synthetic fibres, not knitted", category: 'Apparel' },
  { code: '6205.20', description: "Men's shirts of cotton, not knitted", category: 'Apparel' },
  { code: '6212.10', description: 'Brassieres', category: 'Apparel' },

  // Ch 63: Other textile articles
  { code: '6302.21', description: 'Bed linen of cotton, printed, not knitted', category: 'Home Textiles' },
  { code: '6305.32', description: 'Flexible intermediate bulk containers (FIBCs) of man-made textile materials', category: 'Packaging' },

  // ── SECTION XII: Footwear, Headgear and Umbrellas (Ch 64–67) ───────────

  { code: '6402.91', description: 'Other footwear with uppers of rubber or plastics, covering the ankle', category: 'Footwear' },
  { code: '6403.51', description: 'Footwear with upper of leather, covering the ankle, not covering the knee', category: 'Footwear' },
  { code: '6404.11', description: 'Sports footwear with uppers of textile, outer soles of rubber or plastics', category: 'Footwear' },
  { code: '6404.19', description: 'Other footwear with uppers of textile, outer soles of rubber or plastics', category: 'Footwear' },
  { code: '6506.10', description: 'Safety headgear', category: 'Headwear' },

  // ── SECTION XIII: Articles of Stone, Plaster, Cement, Glass (Ch 68–70) ─

  { code: '6810.19', description: 'Other articles of cement, concrete or artificial stone', category: 'Construction Materials' },
  { code: '6907.21', description: 'Unglazed ceramic flags and paving, coefficient of water absorption ≤ 0.5%', category: 'Ceramics' },
  { code: '6907.22', description: 'Unglazed ceramic flags and paving, water absorption 0.5%–10%', category: 'Ceramics' },
  { code: '6910.10', description: 'Ceramic sinks and washbasins of porcelain or china', category: 'Ceramics' },
  { code: '6911.10', description: 'Tableware and kitchenware of porcelain or china', category: 'Ceramics' },
  { code: '6912.00', description: 'Ceramic tableware, kitchenware and household articles, other than porcelain', category: 'Ceramics' },
  { code: '7005.10', description: 'Non-wired float glass, surface ground or polished, coloured', category: 'Glass' },
  { code: '7007.11', description: 'Toughened (tempered) safety glass for vehicles', category: 'Glass' },
  { code: '7007.21', description: 'Laminated safety glass for vehicles', category: 'Glass' },
  { code: '7013.41', description: 'Glassware for table, kitchen or similar purposes, of glass having linear coefficient of expansion ≤ 5×10⁻⁶', category: 'Glass' },

  // ── SECTION XIV: Natural or Cultured Pearls; Precious Metals (Ch 71) ────

  { code: '7101.21', description: 'Cultured pearls, unworked', category: 'Jewelry & Gems' },
  { code: '7102.31', description: 'Non-industrial diamonds, unworked or simply sawn/cleaved/bruted', category: 'Jewelry & Gems' },
  { code: '7108.12', description: 'Gold (non-monetary), other unwrought forms', category: 'Precious Metals' },
  { code: '7108.13', description: 'Gold, in semi-manufactured forms', category: 'Precious Metals' },
  { code: '7113.11', description: 'Articles of jewellery and parts thereof, of silver', category: 'Jewelry & Gems' },
  { code: '7113.19', description: 'Articles of jewellery, of other precious metals', category: 'Jewelry & Gems' },
  { code: '7117.19', description: 'Other imitation jewellery of base metal, other than gilt', category: 'Jewelry & Gems' },

  // ── SECTION XV: Base Metals and Articles of Base Metal (Ch 72–83) ───────

  // Ch 72: Iron and steel
  { code: '7208.40', description: 'Flat-rolled products of iron, not in coils, hot-rolled, ≥ 4.75 mm thick', category: 'Iron & Steel' },
  { code: '7209.17', description: 'Cold-rolled flat-rolled products of iron, thickness 0.5 mm–1 mm', category: 'Iron & Steel' },
  { code: '7210.49', description: 'Flat-rolled products, otherwise plated or coated with zinc (galvanised), other', category: 'Iron & Steel' },
  { code: '7213.10', description: 'Bars and rods, iron/non-alloy steel, hot-rolled, with indentations, ribs, grooves (rebar)', category: 'Iron & Steel' },
  { code: '7217.10', description: 'Wire of iron or non-alloy steel, not plated or coated', category: 'Iron & Steel' },
  { code: '7219.31', description: 'Flat-rolled products of stainless steel, not coiled, < 3 mm thick', category: 'Iron & Steel' },

  // Ch 73: Articles of iron or steel
  { code: '7304.11', description: 'Seamless line pipe for oil or gas pipelines', category: 'Steel Products' },
  { code: '7306.11', description: 'Welded line pipe for oil or gas pipelines', category: 'Steel Products' },
  { code: '7308.90', description: 'Other structures and parts of structures of iron or steel', category: 'Steel Products' },
  { code: '7312.10', description: 'Stranded wire, ropes and cables of iron or steel', category: 'Steel Products' },
  { code: '7326.90', description: 'Other articles of iron or steel, not elsewhere specified', category: 'Steel Products' },

  // Ch 74: Copper
  { code: '7403.11', description: 'Refined copper cathodes and sections of cathodes, unwrought', category: 'Non-Ferrous Metals' },
  { code: '7408.11', description: 'Copper wire of refined copper, cross-section > 6 mm', category: 'Non-Ferrous Metals' },
  { code: '7411.10', description: 'Copper tubes and pipes of refined copper', category: 'Non-Ferrous Metals' },

  // Ch 76: Aluminium
  { code: '7601.10', description: 'Aluminium, not alloyed, unwrought', category: 'Non-Ferrous Metals' },
  { code: '7601.20', description: 'Aluminium alloys, unwrought', category: 'Non-Ferrous Metals' },
  { code: '7604.10', description: 'Aluminium bars, rods and profiles, not alloyed', category: 'Non-Ferrous Metals' },
  { code: '7606.11', description: 'Aluminium plates, sheets and strip, not alloyed, rectangular', category: 'Non-Ferrous Metals' },
  { code: '7607.11', description: 'Aluminium foil, rolled but not further worked, ≤ 0.2 mm thick', category: 'Non-Ferrous Metals' },
  { code: '7610.10', description: 'Aluminium doors, windows and their frames and thresholds', category: 'Building Materials' },
  { code: '7610.90', description: 'Other aluminium structures and parts of structures', category: 'Building Materials' },

  // Ch 78–80: Lead, Zinc, Tin
  { code: '7801.10', description: 'Refined lead, unwrought', category: 'Non-Ferrous Metals' },
  { code: '7901.11', description: 'Zinc, not alloyed, containing by weight ≥ 99.99% zinc, unwrought', category: 'Non-Ferrous Metals' },
  { code: '8001.10', description: 'Tin, not alloyed, unwrought', category: 'Non-Ferrous Metals' },

  // Ch 82: Tools, cutlery
  { code: '8201.10', description: 'Spades and shovels', category: 'Tools' },
  { code: '8203.20', description: 'Pliers, pincers, tweezers and similar tools', category: 'Tools' },
  { code: '8206.00', description: 'Sets of assorted articles of two or more of headings 8202–8205', category: 'Tools' },
  { code: '8211.92', description: 'Other knives having fixed blades', category: 'Cutlery' },

  // Ch 83: Miscellaneous articles of base metal
  { code: '8301.10', description: 'Padlocks of base metal', category: 'Hardware' },
  { code: '8302.10', description: 'Hinges of base metal', category: 'Hardware' },
  { code: '8302.41', description: 'Other mountings, fittings and similar articles suitable for buildings', category: 'Hardware' },
  { code: '8309.90', description: 'Other stoppers, caps and lids of base metal', category: 'Packaging' },

  // ── SECTION XVI: Machinery and Electrical Equipment (Ch 84–85) ──────────

  // Ch 84: Nuclear reactors, boilers, machinery
  { code: '8408.20', description: 'Compression-ignition internal combustion engines for vehicles (diesel)', category: 'Engines' },
  { code: '8409.91', description: 'Parts for spark-ignition internal combustion engines', category: 'Engine Parts' },
  { code: '8409.99', description: 'Parts for compression-ignition internal combustion engines', category: 'Engine Parts' },
  { code: '8421.23', description: 'Oil or petrol-filters for internal combustion engines', category: 'Engine Parts' },
  { code: '8421.31', description: 'Intake air filters for internal combustion engines', category: 'Engine Parts' },
  { code: '8429.51', description: 'Self-propelled front-end shovel loaders', category: 'Construction Equipment' },
  { code: '8429.52', description: 'Self-propelled excavators', category: 'Construction Equipment' },
  { code: '8443.32', description: 'Other printers capable of connecting to an ADP machine or to a network', category: 'Office Equipment' },
  { code: '8471.30', description: 'Portable automatic data processing machines, weight ≤ 10 kg (laptops)', category: 'Computers' },
  { code: '8471.40', description: 'Automatic data processing machines containing CPU and I/O unit in same housing', category: 'Computers' },
  { code: '8471.50', description: 'Other processing units for automatic data processing machines', category: 'Computers' },
  { code: '8471.70', description: 'Storage units for automatic data processing machines', category: 'Computers' },
  { code: '8473.30', description: 'Parts and accessories for automatic data processing machines', category: 'Computer Parts' },
  { code: '8481.80', description: 'Other taps, cocks, valves and similar appliances', category: 'Industrial Parts' },
  { code: '8483.10', description: 'Transmission shafts (including camshafts and crankshafts) and cranks', category: 'Industrial Parts' },

  // Ch 85: Electrical machinery and equipment
  { code: '8501.10', description: 'AC or DC motors, output ≤ 37.5 W', category: 'Electric Motors' },
  { code: '8501.53', description: 'AC motors, multi-phase, output > 75 kW', category: 'Electric Motors' },
  { code: '8502.11', description: 'Generating sets with compression-ignition engines, ≤ 75 kVA', category: 'Power Equipment' },
  { code: '8504.21', description: 'Liquid dielectric transformers, ≤ 650 kVA', category: 'Power Equipment' },
  { code: '8504.40', description: 'Static converters (rectifiers, inverters)', category: 'Power Equipment' },
  { code: '8506.10', description: 'Manganese dioxide primary cells and primary batteries', category: 'Batteries' },
  { code: '8507.10', description: 'Lead-acid accumulators, for starting piston engines (car batteries)', category: 'Batteries' },
  { code: '8507.60', description: 'Lithium-ion accumulators', category: 'Batteries' },
  { code: '8507.80', description: 'Other electric accumulators', category: 'Batteries' },
  { code: '8511.10', description: 'Sparking plugs for spark-ignition or compression-ignition engines', category: 'Engine Parts' },
  { code: '8511.40', description: 'Starter motors and dual purpose starter-generators', category: 'Engine Parts' },
  { code: '8516.50', description: 'Microwave ovens', category: 'Home Appliances' },
  { code: '8516.60', description: 'Other ovens; cookers, cooking plates, boiling rings, grills and roasters', category: 'Home Appliances' },
  { code: '8516.71', description: 'Coffee or tea makers', category: 'Home Appliances' },
  { code: '8516.72', description: 'Toasters', category: 'Home Appliances' },
  { code: '8517.14', description: 'Smartphones', category: 'Telecommunications' },
  { code: '8517.62', description: 'Machines for the reception, conversion and transmission/regeneration of voice, images or other data (routers, switches)', category: 'Telecommunications' },
  { code: '8517.69', description: 'Other apparatus for transmission or reception of voice, images or data', category: 'Telecommunications' },
  { code: '8518.10', description: 'Microphones and stands therefor', category: 'Audio Equipment' },
  { code: '8518.21', description: 'Single loudspeakers, mounted in their enclosures', category: 'Audio Equipment' },
  { code: '8518.30', description: 'Headphones and earphones, whether or not combined with a microphone', category: 'Audio Equipment' },
  { code: '8523.51', description: 'Solid-state non-volatile storage devices (SSDs, USB flash drives)', category: 'Electronics' },
  { code: '8523.52', description: 'Smart cards', category: 'Electronics' },
  { code: '8525.89', description: 'Other digital cameras and video camera recorders', category: 'Cameras' },
  { code: '8528.52', description: 'Monitors for automatic data processing machines, colour', category: 'Monitors & TVs' },
  { code: '8528.71', description: 'Colour television reception apparatus, incorporating a video display (TV sets)', category: 'Monitors & TVs' },
  { code: '8536.50', description: 'Other switches for voltage not exceeding 1,000 V', category: 'Electrical Components' },
  { code: '8536.69', description: 'Plugs and sockets for voltage not exceeding 1,000 V', category: 'Electrical Components' },
  { code: '8537.10', description: 'Boards, panels, consoles, desks, cabinets for voltage not exceeding 1,000 V', category: 'Electrical Components' },
  { code: '8541.10', description: 'Diodes, other than photosensitive or light-emitting', category: 'Semiconductors' },
  { code: '8541.40', description: 'Photosensitive semiconductor devices, including photovoltaic cells (solar cells)', category: 'Solar & Photovoltaic' },
  { code: '8542.31', description: 'Processors and controllers, electronic integrated circuits', category: 'Semiconductors' },
  { code: '8542.32', description: 'Memories, electronic integrated circuits', category: 'Semiconductors' },
  { code: '8542.33', description: 'Amplifiers, electronic integrated circuits', category: 'Semiconductors' },
  { code: '8542.39', description: 'Other electronic integrated circuits', category: 'Semiconductors' },
  { code: '8544.30', description: 'Ignition wiring sets and other wiring sets for vehicles, aircraft or ships', category: 'Wiring & Cables' },
  { code: '8544.42', description: 'Electric conductors, for voltage ≤ 1,000 V, fitted with connectors', category: 'Wiring & Cables' },
  { code: '8544.49', description: 'Other electric conductors, for voltage ≤ 1,000 V', category: 'Wiring & Cables' },
  { code: '8544.60', description: 'Electric conductors for voltage > 1,000 V', category: 'Wiring & Cables' },

  // ── SECTION XVII: Vehicles, Aircraft, Vessels (Ch 86–89) ────────────────

  // Ch 87: Vehicles (not railway)
  { code: '8701.21', description: 'Road tractors for semi-trailers, with compression-ignition engine (diesel)', category: 'Vehicles' },
  { code: '8702.10', description: 'Motor vehicles for transport of ≥ 10 persons, compression-ignition (diesel)', category: 'Vehicles' },
  { code: '8703.21', description: 'Passenger cars, spark-ignition, cylinder capacity ≤ 1,000 cc', category: 'Vehicles' },
  { code: '8703.22', description: 'Passenger cars, spark-ignition, 1,000 cc < capacity ≤ 1,500 cc', category: 'Vehicles' },
  { code: '8703.23', description: 'Passenger cars, spark-ignition, 1,500 cc < capacity ≤ 3,000 cc', category: 'Vehicles' },
  { code: '8703.24', description: 'Passenger cars, spark-ignition, capacity > 3,000 cc', category: 'Vehicles' },
  { code: '8703.31', description: 'Passenger cars, compression-ignition (diesel), ≤ 1,500 cc', category: 'Vehicles' },
  { code: '8703.32', description: 'Passenger cars, compression-ignition (diesel), 1,500 cc–2,500 cc', category: 'Vehicles' },
  { code: '8703.40', description: 'Passenger cars, spark-ignition + electric motor (hybrid)', category: 'Vehicles' },
  { code: '8703.80', description: 'Passenger cars, electric motor only (EV)', category: 'Electric Vehicles' },
  { code: '8704.21', description: 'Motor vehicles for transport of goods, diesel, GVW ≤ 5 tonnes', category: 'Vehicles' },
  { code: '8704.22', description: 'Motor vehicles for transport of goods, diesel, GVW 5–20 tonnes', category: 'Vehicles' },
  { code: '8704.31', description: 'Motor vehicles for transport of goods, gasoline, GVW ≤ 5 tonnes', category: 'Vehicles' },
  { code: '8706.00', description: 'Chassis fitted with engines, for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.10', description: 'Bumpers and parts thereof for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.21', description: 'Safety seat belts for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.30', description: 'Brakes and servo-brakes and parts thereof for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.40', description: 'Gear boxes and parts thereof for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.50', description: 'Drive axles with differential for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.70', description: 'Road wheels and parts and accessories thereof for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.80', description: 'Suspension shock absorbers for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.91', description: 'Radiators and parts thereof for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.92', description: 'Silencers (mufflers) and exhaust pipes for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.93', description: 'Clutches and parts thereof for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.94', description: 'Steering wheels, steering columns and steering boxes for motor vehicles', category: 'Vehicle Parts' },
  { code: '8708.99', description: 'Other parts and accessories for motor vehicles', category: 'Vehicle Parts' },
  { code: '8711.20', description: 'Motorcycles with reciprocating piston engine, 50 cc < capacity ≤ 250 cc', category: 'Motorcycles' },
  { code: '8711.30', description: 'Motorcycles with reciprocating piston engine, 250 cc < capacity ≤ 500 cc', category: 'Motorcycles' },
  { code: '8711.60', description: 'Motorcycles, with electric motor for propulsion', category: 'Electric Vehicles' },

  // Ch 88: Aircraft
  { code: '8802.30', description: 'Aeroplanes and other powered aircraft, unladen weight 2,000–15,000 kg', category: 'Aircraft' },
  { code: '8802.40', description: 'Aeroplanes and other powered aircraft, unladen weight > 15,000 kg', category: 'Aircraft' },
  { code: '8806.24', description: 'Unmanned aircraft (drones), max takeoff weight > 250 g and ≤ 7 kg', category: 'Drones' },

  // Ch 89: Ships and boats
  { code: '8901.10', description: 'Cruise ships, excursion boats and similar vessels for transport of persons', category: 'Ships & Boats' },
  { code: '8901.20', description: 'Tanker ships', category: 'Ships & Boats' },
  { code: '8902.00', description: 'Fishing vessels; factory ships for processing fish', category: 'Ships & Boats' },

  // ── SECTION XVIII: Optical, Medical and Precision Instruments (Ch 90–92) ─

  // Ch 90: Optical, medical instruments
  { code: '9001.10', description: 'Optical fibres and optical fibre bundles; optical fibre cables', category: 'Optical Equipment' },
  { code: '9001.40', description: 'Spectacle lenses of glass', category: 'Optical Equipment' },
  { code: '9001.50', description: 'Spectacle lenses of materials other than glass', category: 'Optical Equipment' },
  { code: '9003.11', description: 'Frames and mountings for spectacles, of plastics', category: 'Optical Equipment' },
  { code: '9004.10', description: 'Sunglasses', category: 'Optical Equipment' },
  { code: '9018.11', description: 'Electrocardiographs', category: 'Medical Equipment' },
  { code: '9018.12', description: 'Ultrasonic scanning apparatus', category: 'Medical Equipment' },
  { code: '9018.19', description: 'Other electro-diagnostic apparatus', category: 'Medical Equipment' },
  { code: '9018.39', description: 'Other syringes, needles, catheters and cannulae', category: 'Medical Supplies' },
  { code: '9018.41', description: 'Dental drill engines', category: 'Dental Equipment' },
  { code: '9019.10', description: 'Mechano-therapy appliances; massage apparatus', category: 'Medical Equipment' },
  { code: '9021.10', description: 'Orthopaedic appliances, including crutches, surgical belts and trusses', category: 'Medical Devices' },
  { code: '9021.31', description: 'Artificial joints', category: 'Medical Devices' },
  { code: '9021.40', description: 'Hearing aids, excluding parts and accessories', category: 'Medical Devices' },
  { code: '9022.12', description: 'Computed tomography (CT) scanners', category: 'Medical Equipment' },
  { code: '9022.14', description: 'X-ray apparatus for medical, surgical, dental or veterinary use', category: 'Medical Equipment' },
  { code: '9026.10', description: 'Instruments for measuring or checking the flow or level of liquids', category: 'Measuring Instruments' },
  { code: '9030.31', description: 'Multimeters, without a recording device', category: 'Measuring Instruments' },
  { code: '9032.10', description: 'Thermostats', category: 'Measuring Instruments' },

  // Ch 91: Clocks and watches
  { code: '9101.11', description: 'Wrist-watches, electrically operated, with mechanical display only, precious metal case', category: 'Watches' },
  { code: '9102.11', description: 'Wrist-watches, electrically operated, with mechanical display only, other case', category: 'Watches' },
  { code: '9102.12', description: 'Wrist-watches, electrically operated, with opto-electronic display only', category: 'Watches' },
  { code: '9105.11', description: 'Alarm clocks, battery-operated', category: 'Clocks' },

  // Ch 92: Musical instruments
  { code: '9201.10', description: 'Upright pianos', category: 'Musical Instruments' },
  { code: '9207.10', description: 'Musical instruments, the sound of which is produced or amplified electrically', category: 'Musical Instruments' },

  // ── SECTION XIX: Arms and Ammunition (Ch 93) ─────────────────────────────

  { code: '9302.00', description: 'Revolvers and pistols', category: 'Arms' },
  { code: '9303.20', description: 'Other sporting, hunting or target-shooting shotguns', category: 'Arms' },
  { code: '9306.21', description: 'Cartridges for shotguns', category: 'Ammunition' },
  { code: '9306.30', description: 'Other cartridges and parts thereof', category: 'Ammunition' },

  // ── SECTION XX: Miscellaneous Manufactured Articles (Ch 94–96) ──────────

  // Ch 94: Furniture, bedding, lighting
  { code: '9401.30', description: 'Swivel seats with variable height adjustment', category: 'Furniture' },
  { code: '9401.41', description: 'Seats of rattan, osier, bamboo or similar materials', category: 'Furniture' },
  { code: '9401.61', description: 'Upholstered seats with wooden frame (not convertible into bed)', category: 'Furniture' },
  { code: '9401.71', description: 'Other seats with metal frame, upholstered', category: 'Furniture' },
  { code: '9403.20', description: 'Other metal furniture', category: 'Furniture' },
  { code: '9403.30', description: 'Wooden furniture of a kind used in offices', category: 'Furniture' },
  { code: '9403.40', description: 'Wooden furniture of a kind used in the kitchen', category: 'Furniture' },
  { code: '9403.50', description: 'Wooden furniture of a kind used in the bedroom', category: 'Furniture' },
  { code: '9403.60', description: 'Other wooden furniture', category: 'Furniture' },
  { code: '9403.70', description: 'Furniture of plastics', category: 'Furniture' },
  { code: '9404.21', description: 'Mattresses of cellular rubber or plastics, whether or not covered', category: 'Bedding' },
  { code: '9404.29', description: 'Mattresses of other materials (spring, foam, cotton fill)', category: 'Bedding' },
  { code: '9405.11', description: 'Chandeliers and other ceiling or wall light fittings, electric', category: 'Lighting' },
  { code: '9405.21', description: 'Table, desk, bedside or floor-standing lamps, electric', category: 'Lighting' },
  { code: '9405.40', description: 'Other electric lamps and lighting fittings', category: 'Lighting' },

  // Ch 95: Toys, games, sports equipment
  { code: '9503.00', description: 'Tricycles, scooters, pedal cars and similar wheeled toys; dolls\' carriages; dolls; other toys; reduced-scale models', category: 'Toys' },
  { code: '9504.50', description: 'Video game consoles and machines', category: 'Gaming' },
  { code: '9506.11', description: 'Skis', category: 'Sports Equipment' },
  { code: '9506.31', description: 'Golf clubs, complete', category: 'Sports Equipment' },
  { code: '9506.61', description: 'Lawn-tennis balls', category: 'Sports Equipment' },
  { code: '9506.62', description: 'Inflatable balls (football, volleyball, basketball, rugby, other)', category: 'Sports Equipment' },
  { code: '9506.91', description: 'Articles and equipment for general physical exercise, gymnastics or athletics', category: 'Sports Equipment' },
  { code: '9507.10', description: 'Fishing rods', category: 'Sports Equipment' },

  // Ch 96: Miscellaneous manufactured articles
  { code: '9603.21', description: 'Toothbrushes', category: 'Personal Care' },
  { code: '9607.11', description: 'Slide fasteners fitted with chain scoops of base metal (zippers)', category: 'Haberdashery' },
  { code: '9608.10', description: 'Ball point pens', category: 'Stationery' },
  { code: '9608.20', description: 'Felt-tipped and other porous-tipped pens and markers', category: 'Stationery' },
  { code: '9613.10', description: 'Pocket lighters, gas fuelled, non-refillable', category: 'Miscellaneous' },
  { code: '9619.00', description: 'Sanitary towels (pads) and tampons, nappies and napkin liners for babies, of any material', category: 'Personal Care' },

  // ── SECTION XXI: Works of Art, Collectors\' Pieces and Antiques (Ch 97) ──

  { code: '9701.10', description: 'Paintings, drawings and pastels, executed entirely by hand', category: 'Art' },
  { code: '9703.10', description: 'Original sculptures and statuary, in any material', category: 'Art' },
  { code: '9704.00', description: 'Postage or revenue stamps, first-day covers, postal stationery — collectors\' pieces', category: 'Collectibles' },
  { code: '9706.00', description: 'Antiques of an age exceeding one hundred years', category: 'Antiques' },
]

/**
 * Returns the full core catalog with chapter/section metadata populated.
 * Safe to call at DB seed time; uses INSERT OR IGNORE so re-runs are idempotent.
 */
export const getCoreCatalogWithMetadata = (): Array<
  HSCatalogRawEntry & {
    catalogVersion: string
    chapterCode?: string
    sectionCode?: string
    sectionName?: string
    metadataSource: string
  }
> => {
  return RAW_CATALOG.map((row) => {
    const meta = getHsCodeMetadata(row.code)
    return {
      ...row,
      catalogVersion: 'AHTN-2022',
      chapterCode: meta?.chapterCode,
      sectionCode: meta?.sectionCode,
      sectionName: meta?.sectionName,
      metadataSource: 'seed',
    }
  })
}
