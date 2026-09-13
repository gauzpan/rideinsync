Update the RideInSync mobile app UI to improve typography, readability, visual hierarchy, and overall premium visual quality.

IMPORTANT:
- Do not change the app's functionality, navigation, data, or business logic.
- Do not redesign the entire app.
- Keep the existing dark cinematic motorcycle aesthetic and lime-green brand accent.
- Use the existing design system as the base and update the UI consistently across the app.

1. TYPOGRAPHY

Replace the current generic UI typography with:

Font:
- Use Acumin Pro if already available.
- If Acumin Pro is not available, use Plus Jakarta Sans as fallback.
- Keep a system sans-serif fallback.

Use stronger typography hierarchy:

Screen heading:
- 26px
- weight 600–700
- line-height 32px
- color #FFFFFF

Component/card heading:
- 16px
- weight 600
- line-height 22px
- color #FFFFFF

Body:
- 15–16px
- weight 450–500
- line-height 21–24px
- color #B7B7BC

Secondary/meta:
- 13–14px
- weight 500
- line-height 19–20px
- color #85858B

Large statistics:
- 30–32px
- weight 700
- line-height 34px
- color #FFFFFF

Button text:
- 17px
- weight 600
- color appropriate to button background

Avoid excessive use of 400-weight text. Important information should use 500–700 weights.

2. TEXT COLORS

Improve readability on the dark background.

Use:

Primary:   #FFFFFF
Secondary: #B7B7BC
Tertiary:  #85858B
Disabled:  #626267

Do not use very dim gray text for important information.

3. HOME SCREEN HEADING

Change the greeting hierarchy.

Instead of treating:

"Hey, rider"

as one uniform text element, visually emphasize "rider".

Example:

Hey,
rider

"Hey," should be muted/light gray.
"rider" should be white and semibold/bold.

Keep the overall style compact and premium.

4. PRIMARY / SECONDARY BUTTONS

"Create a ride" should be the dominant CTA.

Primary:
- Height 56px
- Full width
- Lime #C4F82A
- Near-black text
- 17px / 600
- Keep pill shape
- Add a subtle interaction/pressed state

"Join a ride":
- Height around 52px
- Dark translucent surface
- Subtle white border
- White text
- Less visual emphasis than Create a ride

Do not make both buttons look equally important.

5. CARDS

Refine the cards so they feel more premium and less like flat gray rectangles.

Use subtle layered/glass surfaces:

background:
rgba(255,255,255,0.05–0.08)

border:
1px solid rgba(255,255,255,0.10–0.14)

Use:
- 16–20px radius
- subtle shadow
- subtle gradient/highlight where appropriate

Do NOT use excessive blur or strong glass effects.

6. BACKGROUND MOTORCYCLE IMAGE

Keep the motorcycle background because it adds personality.

However, it currently competes with the text.

Add a stronger dark overlay/gradient behind the UI:

- Darkest around the upper content area
- Gradually reveal the motorcycle toward the lower half
- Keep text and cards clearly readable

The motorcycle should feel like an atmospheric visual layer, not compete with the UI.

7. RIDER SETUP CARD

Improve the "Finish your rider setup" card.

Make the hierarchy:

Finish your rider setup
0 / 4 complete

Use a clearer visual progress indicator.

The title should be white and semibold.
The supporting text should be brighter than the current gray.

Make the card feel actionable rather than disabled.

8. VOICE COMMAND CARD

Keep the voice command card.

Improve it by:
- Making the microphone icon lime
- Giving the icon a subtle lime-tinted circular background
- Making "Turn on voice commands" 16px / 600
- Making the supporting text 14px / 500
- Keep the card visually consistent with the setup card

9. RIDING STATISTICS

Improve the statistics section.

Make the numbers the visual focus.

Example:

12
Rides

486 km
Distance

3
Rides led

Use:
- 30–32px bold numbers
- 13px labels
- Strong contrast
- Consistent alignment

For "486 km", make 486 dominant and "km" smaller.

Remove the feeling that these are generic database fields.

10. SECTION LABEL

Replace:

"YOUR RIDING · SAMPLE DATA"

with:

"Your riding"

Use sentence case.
Do not use unnecessary all-caps text.

11. EMPTY STATE

Improve readability of:

"No rides yet. Create your first pod or join one with a code."

Use a cleaner hierarchy, for example:

"Ready to ride?"

"Create your first ride or join a group."

Keep the copy concise.

12. BOTTOM NAVIGATION

Improve the active navigation state.

Home should clearly look active.

Recommended:
- Active icon: lime
- Active label: white
- Inactive icons: #85858B
- Inactive labels: #85858B

Avoid making the bottom navigation visually compete with the primary CTA.

13. ICONOGRAPHY

Keep icons modern, simple, and consistent.

Use:
- rounded stroke icons
- consistent stroke width
- 20–24px icon size
- white for normal actions
- lime for active/live/voice states

Avoid mixing different icon styles.

14. SPACING

Keep the existing 4px/8px spacing system.

Increase breathing room between major sections where necessary.

Recommended:
- Screen horizontal padding: 20px
- Major section gap: 24–32px
- Card internal padding: 16px
- Button spacing: 10–12px

Do not make the screen feel cramped.

15. IMPORTANT VISUAL RULE

The hierarchy should be:

1. Create a ride
2. Hey, rider
3. Rider setup / Voice commands
4. Riding statistics
5. Supporting information
6. Bottom navigation

The user should immediately understand what action to take.

16. DO NOT

- Do not change functionality
- Do not change routes/navigation logic
- Do not change API/data logic
- Do not introduce bright colors other than the existing lime accent
- Do not make everything bold
- Do not make every element glow
- Do not overuse glassmorphism
- Do not use all-caps labels
- Do not make every component a pill
- Do not remove the motorcycle imagery

17. FINAL CHECK

After implementation, review the Home screen at approximately 375–430px mobile width.

Check:
- Text is clearly readable over the motorcycle image
- Primary CTA immediately stands out
- Secondary CTA is clearly secondary
- Headings and body text have obvious hierarchy
- Statistics are easy to scan
- Cards feel premium rather than flat
- Bottom navigation is visually quiet
- No text feels too small or too dim

