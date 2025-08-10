# Database Security Policies

| Table Name | Policy Name | Command | Using Expression | Check Expression |
|------------|-------------|---------|------------------|------------------|
| bet_mode_best_of_best | bob_insert | INSERT | null | `(EXISTS ( SELECT 1 FROM (bet_proposals bp JOIN table_members tm ON ((tm.table_id = bp.table_id))) WHERE ((bp.bet_id = bet_mode_best_of_best.bet_id) AND (tm.user_id = auth.uid()) AND (bp.proposer_user_id = auth.uid()) AND (bp.bet_status = 'active'::text))))` |
| bet_mode_best_of_best | bob_select | SELECT | `(EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = bet_mode_best_of_best.bet_id) AND is_user_member_of_table(bp.table_id, auth.uid()))))` | null |
| bet_mode_best_of_best | bob_update | UPDATE | `(EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = bet_mode_best_of_best.bet_id) AND (bp.proposer_user_id = auth.uid()) AND (bp.bet_status = 'active'::text))))` | `(EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = bet_mode_best_of_best.bet_id) AND (bp.proposer_user_id = auth.uid()) AND (bp.bet_status = 'active'::text))))` |
| bet_mode_one_leg_spread | ols_insert | INSERT | null | `(EXISTS ( SELECT 1 FROM (bet_proposals bp JOIN table_members tm ON ((tm.table_id = bp.table_id))) WHERE ((bp.bet_id = bet_mode_one_leg_spread.bet_id) AND (tm.user_id = auth.uid()) AND (bp.proposer_user_id = auth.uid()) AND (bp.bet_status = 'active'::text))))` |
| bet_mode_one_leg_spread | ols_select | SELECT | `(EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = bet_mode_one_leg_spread.bet_id) AND is_user_member_of_table(bp.table_id, auth.uid()))))` | null |
| bet_mode_one_leg_spread | ols_update | UPDATE | `(EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = bet_mode_one_leg_spread.bet_id) AND (bp.proposer_user_id = auth.uid()) AND (bp.bet_status = 'active'::text))))` | `(EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = bet_mode_one_leg_spread.bet_id) AND (bp.proposer_user_id = auth.uid()) AND (bp.bet_status = 'active'::text))))` |
| bet_modes | bet_modes_read | SELECT | true | null |
| bet_participations | Participations are updatable by users | UPDATE | `((user_id = auth.uid()) AND (bet_id IN ( SELECT bet_proposals.bet_id FROM bet_proposals WHERE (bet_proposals.bet_status = 'active'::text))))` | null |
| bet_participations | Users can participate in open bets in their tables | INSERT | null | `((auth.uid() = user_id) AND (EXISTS ( SELECT 1 FROM table_members tm WHERE ((tm.table_id = bet_participations.table_id) AND (tm.user_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = bet_participations.bet_id) AND (bp.table_id = bet_participations.table_id) AND (bp.bet_status = 'active'::text) AND (EXTRACT(epoch FROM (now() - bp.proposal_time)) < (bp.time_limit_seconds)::numeric)))))` |
| bet_participations | Users can view participations in their tables or their own | SELECT | `((auth.uid() = user_id) OR is_table_member(table_id, auth.uid()))` | null |
| bet_proposals | Allow members to create bet proposals in their tables | INSERT | null | `((proposer_user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM table_members tm WHERE ((tm.table_id = bet_proposals.table_id) AND (tm.user_id = auth.uid())))))` |
| bet_proposals | Allow members to view bet proposals in their tables | SELECT | `(EXISTS ( SELECT 1 FROM table_members tm WHERE ((tm.table_id = bet_proposals.table_id) AND (tm.user_id = auth.uid()))))` | null |
| bet_proposals | Allow proposers to update their open bet proposals | UPDATE | `((proposer_user_id = auth.uid()) AND (bet_status = 'Active::text'::text))` | `(proposer_user_id = auth.uid())` |
| feed_items | Feed items updates are restricted | UPDATE | false | null |
| feed_items | Users can delete their own feed items; hosts can delete any | DELETE | `(is_table_member(table_id, auth.uid()) AND ((auth.uid() = get_table_host_user_id(table_id)) OR ((item_type = 'text_message'::text) AND (EXISTS ( SELECT 1 FROM text_messages txt WHERE ((txt.text_message_id = feed_items.text_message_id) AND (txt.user_id = auth.uid()))))) OR ((item_type = 'bet_proposal'::text) AND (EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = feed_items.bet_proposal_id) AND (bp.proposer_user_id = auth.uid())))))))` | null |
| feed_items | Users can insert their own content as feed items | INSERT | null | `(is_table_member(table_id, auth.uid()) AND (((item_type = 'text_message'::text) AND (text_message_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM text_messages txt WHERE ((txt.text_message_id = feed_items.text_message_id) AND (txt.user_id = auth.uid()))))) OR ((item_type = 'bet_proposal'::text) AND (bet_proposal_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM bet_proposals bp WHERE ((bp.bet_id = feed_items.bet_proposal_id) AND (bp.proposer_user_id = auth.uid())))))))` |
| feed_items | Users can view feed items from their tables | SELECT | `is_table_member(table_id, auth.uid())` | null |
| friends | Allow users to add friends | INSERT | null | `((auth.uid() = user_id1) AND (user_id1 <> user_id2))` |
| friends | Allow users to read their own friendships | SELECT | `((auth.uid() = user_id1) OR (auth.uid() = user_id2))` | null |
| friends | Allow users to remove their own friendships | DELETE | `((auth.uid() = user_id1) OR (auth.uid() = user_id2))` | null |
| private_tables | Allow authenticated insert for private tables | INSERT | null | `(host_user_id = auth.uid())` |
| private_tables | Allow host to delete their private table | DELETE | `(host_user_id = auth.uid())` | null |
| private_tables | Allow host to update their private table | UPDATE | `(host_user_id = auth.uid())` | `(host_user_id = auth.uid())` |
| private_tables | Allow members and host to read private table details | SELECT | `((host_user_id = auth.uid()) OR is_user_member_of_table(table_id, auth.uid()))` | null |
| system_notifications | System notifications deletes are restricted | DELETE | false | null |
| system_notifications | System notifications inserts are restricted | INSERT | null | false |
| system_notifications | System notifications updates are restricted | UPDATE | false | null |
| system_notifications | Users can view system_notifications linked to tables they are members of | SELECT | `(EXISTS ( SELECT 1 FROM (feed_items fi JOIN table_members tm ON ((fi.table_id = tm.table_id))) WHERE ((fi.system_notification_id = system_notifications.system_notification_id) AND (tm.user_id = auth.uid()))))` | null |
| table_members | Allow hosts to add members to their tables | INSERT | null | `is_user_host_of_table(table_id, auth.uid())` |
| table_members | Allow hosts to remove members from their tables | DELETE | `(EXISTS ( SELECT 1 FROM private_tables pt WHERE ((pt.table_id = table_members.table_id) AND (pt.host_user_id = auth.uid()))))` | null |
| table_members | Allow members to leave tables | DELETE | `(user_id = auth.uid())` | null |
| table_members | Allow members to read own membership and hosts to read their tables | SELECT | `((user_id = auth.uid()) OR is_user_member_of_table(table_id, auth.uid()))` | null |
| text_messages | Users can delete their own text messages | DELETE | `(auth.uid() = user_id)` | null |
| text_messages | Users can insert their own text messages | INSERT | null | `(auth.uid() = user_id)` |
| text_messages | Users can update their own text messages | UPDATE | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |
| text_messages | Users can view text messages linked to tables they are members of | SELECT | `((EXISTS ( SELECT 1 FROM (feed_items fi JOIN table_members tm ON ((fi.table_id = tm.table_id))) WHERE ((fi.text_message_id = text_messages.text_message_id) AND (tm.user_id = auth.uid())))) OR (auth.uid() = user_id))` | null |
| users | Allow authenticated read access to usernames | SELECT | `(auth.role() = 'authenticated'::text)` | null |
| users | Allow individual read access to own profile | SELECT | `(auth.uid() = user_id)` | null |
| users | Allow users to update their own profile | UPDATE | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |

## Summary

This updated table contains **36 security policies** across **11 database tables** for the betting/social platform application. The key additions from the previous version include:

### New Tables Added:
- **bet_mode_best_of_best** (3 policies) - Security for "best of best" betting mode
- **bet_mode_one_leg_spread** (3 policies) - Security for "one leg spread" betting mode  
- **bet_modes** (1 policy) - General read access to betting modes

### Policy Distribution:
- **bet_mode_best_of_best** (3 policies) - Insert, select, and update operations
- **bet_mode_one_leg_spread** (3 policies) - Insert, select, and update operations
- **bet_modes** (1 policy) - Read-only access for all users
- **bet_participations** (3 policies) - Managing user participation in bets
- **bet_proposals** (3 policies) - Creating and managing bet proposals
- **feed_items** (3 policies) - Content feed management
- **friends** (3 policies) - Friend relationship management
- **private_tables** (4 policies) - Private table access control
- **system_notifications** (4 policies) - System notification restrictions
- **table_members** (4 policies) - Table membership management
- **text_messages** (4 policies) - Text message permissions
- **users** (3 policies) - User profile access

The new betting mode tables follow similar security patterns, ensuring that only bet proposers can create and modify betting mode configurations for active bets in tables where they are members, while allowing all table members to view them.