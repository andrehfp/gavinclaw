# Email Drip — Zero Credit Users (Final Version)

## Trigger: User hits 0 credits, no purchase within 24h

---

## Email 1: Immediate (when credits hit 0)

**Subject:** The render that almost got away
**Preview:** A quick story about what happened to Sarah last Tuesday...

---

Last Tuesday, Sarah sat across from a client who asked:

*"Can you show me this in Scandinavian style?"*

She opened her laptop. Loaded MoldaSpace. Clicked generate.

Nothing. She'd burned through her free credits testing the tool the night before.

*"I'll send you renders next week,"* she said.

The client nodded. Sarah never heard from them again.

Here's the thing. Sarah's not bad at what she does. She's actually excellent.

But she made a choice that cost her: she waited.

Need doesn't schedule itself. It shows up in meetings. In client calls. In the moment when visualizing *right now* is the difference between winning and losing.

**Your credits are at zero.**

You can wait. Or you can be ready when the next opportunity shows up.

10 renders. $4.80 (20% off your first purchase). Credits never expire.

[Get 10 Credits →]

— André, MoldaSpace

P.S. Sarah bought credits the next day. She's still kicking herself about that meeting.

---

## Email 2: 24h later (only if no purchase)

**Subject:** What happened next...
**Preview:** Sarah's second chance

---

Yesterday I told you about Sarah. The designer who ran out of credits mid-meeting.

Here's the rest of the story.

She bought credits. Not because she wanted to. Because she refused to feel that helpless again.

Two weeks later, same scenario. Client meeting. *"Can you show me a different style?"*

This time she generated 4 variations in 2 minutes.

*"I didn't know you could do that so fast."*

She closed the project an hour later. Signed contract. Deposit paid.

The only thing that changed: she was ready.

Your 20% first-purchase discount expires today.

10 credits = $4.80 (tomorrow: $6.00). Same tool, different price.

[Get Credits Before Price Goes Up →]

— André

P.S. 800+ designers use MoldaSpace. They're not special. They're just prepared.

---

## Email 3: 72h later (only if no purchase)

**Subject:** The sketch on the napkin
**Preview:** What our most active users figured out

---

Marcus is an architect in Chicago.

Last month he showed up to a client meeting with nothing but his phone and a sketch he'd drawn on a napkin during the Uber ride over.

The client showed him an empty warehouse. 4,000 square feet. Raw brick. Exposed beams.

*"Can you visualize this as a modern office?"*

Marcus pulled out his phone. Uploaded his napkin sketch to MoldaSpace.

30 seconds later: a photorealistic render of exactly what he'd described.

The client hired him on the spot.

Here's what you might not realize: **MoldaSpace doesn't need polished inputs.**

Hand sketches. Phone photos of empty rooms. Floor plans with scribbled notes. The AI reads structure, not polish.

You don't need to wait for the perfect 3D model. Sketch an idea at lunch. Render it before the meeting. Present it that afternoon.

Your credits are waiting if you want them. 2 bonus credits on us, just click below.

[Claim 2 Free Credits →]

No pressure. But the next time you're in a meeting with nothing but a sketch and an idea, remember: you could have been ready.

— André

---

## Implementation Notes

- **Numbers:** Pull real-time from DB (users, renders count)
- **Discount:** 20% first-purchase already exists ✅
- **Email 3 bonus:** 2 free credits via unique link (auto-grant on click)
- **Sign as:** André (personal, not "MoldaSpace Team")
- **Suppress:** if user purchased since trigger
- **Provider:** Resend (100/day free tier, batch backfill over 7 days)
- **Track:** drip_emails table (user_id, email_number, sent_at, opened, clicked)
