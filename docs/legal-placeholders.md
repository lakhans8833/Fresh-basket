# Legal pages: details the owner must supply

The Privacy, Terms and Returns pages are templates (they show a "Template — review with a legal adviser"
notice). These placeholders are still visible to customers and must be replaced with the owner's real,
approved details — they are deliberately NOT filled in by the developers:

| Page | File | Placeholders |
| --- | --- | --- |
| Privacy | `apps/web/src/app/(shop)/privacy/page.tsx` | `[date]`, `[registered business name]`, `[registered address]`, `[privacy contact email]`, `[Describe how to unsubscribe.]`, `[If you add analytics or marketing tools…]`, `[list providers, e.g. hosting and Supabase]`, `[period]` (×2), data-protection rights / grievance officer details |
| Terms | `apps/web/src/app/(shop)/terms/page.tsx` | `[date]`, `[registered business name]`, `[registration details]`, `[registered address]`, `[state whether inclusive of applicable taxes]`, `[Describe what happens if nobody is available.]`, `[Limitation of liability wording…]`, `[jurisdiction]`, `[city/state]`, `[Add grievance officer details if required.]` |
| Returns | `apps/web/src/app/(shop)/returns/page.tsx` | `[date]`, `[registered business name]`, `[24 hours]`, `[the tolerance stated on the product]`, `[store credit if you choose to offer it]`, `[5–7 working days]`, refund method, grievance officer details |

When the approved text is ready, replace the bracketed text and remove `template` from the `<InfoPage>`.
