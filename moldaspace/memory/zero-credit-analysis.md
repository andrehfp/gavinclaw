# MoldaSpace Zero-Credit User Analysis
*Analysis Date: February 16, 2026*

## Executive Summary

Out of 781 total users, **85 users (10.9%) have exhausted their credits without making a purchase**. Among new users (last 14 days), we identified **24 users** who ran out of credits without converting to paid customers.

### Key Findings

1. **Very Low Conversion Rate**: Only 31 users (4.0%) have made purchases
2. **Rapid Credit Depletion**: Most users burn through their 5 free credits within hours or days
3. **Poor Credit Wall Tracking**: Only 1 user has `last_credit_wall_at` tracked
4. **Standard Usage Pattern**: Users typically do exactly 5 renders then abandon

## Detailed Analysis

### 1. Recent Zero-Credit Users (Last 14 Days)

**24 users** signed up in the last 14 days and exhausted their credits without purchasing:

**Top Performers (by renders):**
- `user_39aB6PjMTBgnjZmrkL0vYi9w9JT`: 20 renders (but did purchase 1 credit pack)
- Most others: exactly 5 renders (the free credit limit)
- `user_39aAMLYu9d81Ep2UWl0ZDpgy2Y3`: 4 renders

**Pattern**: Almost all users stop at exactly 5 renders, suggesting they hit the credit wall and don't convert.

### 2. Credit Wall Tracking Issues

**CRITICAL FINDING**: Only **1 out of 85** zero-credit users have `last_credit_wall_at` tracked.

- User: `user_39c5jRYRhJuglisi5Q0i2p49MdU`
- Signup: 2026-02-13 11:37:36
- Credit wall hit: 2026-02-14 13:36:20 (24+ hours later)
- Last attempted prompt: "Enhance photorealism significantly. Improve material textures with realistic reflections and imperfections, add natural lighting with proper shadows, include subtle environmental details like dust particles in light beams. Maintain the exact composition and layout."

**Issue**: The credit wall tracking system is not functioning properly, which prevents effective remarketing to users who showed intent to continue using the service.

### 3. Buyer vs Non-Buyer Behavior Comparison

**Buyers (31 users):**
- Average renders before first purchase: **2.13**
- Behavior: Convert quickly, usually after 2-3 renders

**Non-Buyers (54+ users with transaction data):**
- Typical renders: **5** (exhaust free credits then leave)
- Pattern: Use all free credits, then abandon

**Insight**: Buyers convert early (2-3 renders), while non-buyers use all free credits (5 renders) then churn. This suggests a clear decision point around the 3rd render.

### 4. Time to Churn Analysis

For users with valid signup dates who didn't purchase:

**Speed of Churn (23 users analyzed):**
- **Fast Burners** (< 1 hour): 7 users (30%)
- **Same Day** (1-24 hours): 13 users (57%) 
- **Multi-day**: 3 users (13%)

**Examples:**
- Fastest: `user_39h5kPqbVYzVdkxyWMxRC6AKDnS` - 2 minutes 17 seconds
- Slowest: `user_39fAsgJ056kshrgqOAfwvYrGuq3` - 1 day 6 hours
- Most common: Under 3 hours from signup to credit exhaustion

### 5. Failed Prompts Analysis

**Limited Data**: Only 1 user has `last_attempted_prompt` tracked when hitting credit wall.

The tracked prompt was highly detailed and specific:
> "Enhance photorealism significantly. Improve material textures with realistic reflections and imperfections, add natural lighting with proper shadows, include subtle environmental details like dust particles in light beams. Maintain the exact composition and layout."

This suggests the user was engaged and trying to create high-quality output when blocked by the credit wall.

## Platform Statistics

- **Total Users**: 781
- **Zero Credit Users**: 85 (10.9%)
- **Users with Purchases**: 31 (4.0%)
- **Recent Zero-Credit Users (14 days)**: 24
- **Credit Wall Tracking Working**: 1 user only (1.2%)

## Critical Issues Identified

### 1. Broken Credit Wall Tracking
- `last_credit_wall_at` field is only populated for 1 user
- `last_attempted_prompt` field is only populated for 1 user
- This prevents effective remarketing and user flow analysis

### 2. High Early Churn Rate
- 57% of users exhaust credits within 24 hours
- 30% exhaust credits within 1 hour
- Most users follow the exact pattern: signup → 5 renders → abandon

### 3. Low Conversion Rate
- Only 4.0% of users convert to paid customers
- Clear gap between buyers (convert at 2-3 renders) and churners (abandon at 5 renders)

## Recommendations

### Immediate Actions
1. **Fix Credit Wall Tracking**: Ensure `last_credit_wall_at` and `last_attempted_prompt` are properly logged
2. **Implement Conversion Funnel at Render 3**: Since buyers convert early, add intervention at 3rd render
3. **Credit Wall Remarketing**: Set up email campaigns for users who hit credit wall
4. **Usage Pattern Analysis**: Monitor the 2-3 render decision point more closely

### Strategic Considerations
1. **Credit Allocation**: Consider if 5 free credits is optimal (buyers only need 2-3)
2. **Onboarding Flow**: Focus on getting high-quality results in first 2-3 renders
3. **Pricing Strategy**: Current 4% conversion suggests pricing or value proposition issues
4. **User Education**: Help users understand value proposition before they hit credit wall

---

*Data extracted from Neon DB on 2026-02-16 11:12 GMT-3*
*Analysis includes users from 2026-02-02 to 2026-02-16*