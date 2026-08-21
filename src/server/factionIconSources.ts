/**
 * Titan Legions and Chaos Titan Legions have no core rules directory — no
 * detachments or stratagems in this edition — so their icon has nowhere else
 * to come from. Fetched and cached the same way as every other faction's
 * icon, rather than linked to directly from the client.
 */
export const SUPPLEMENTAL_FACTION_ICONS: { id: string; logoUrl: string }[] = [
  {
    id: 'adeptus-titanicus',
    logoUrl:
      'https://cdn.jsdelivr.net/gh/Certseeds/wh40k-icon@be230023ff0755d19ffb1a1762658c711c2887f9/src/svgs/human_imperium/mechanicum/collegia-titanica.svg',
  },
  {
    id: 'titanicus-traitoris',
    logoUrl:
      'https://cdn.jsdelivr.net/gh/Certseeds/wh40k-icon@be230023ff0755d19ffb1a1762658c711c2887f9/src/svgs/chaos/titanicus-traitoris.svg',
  },
]
