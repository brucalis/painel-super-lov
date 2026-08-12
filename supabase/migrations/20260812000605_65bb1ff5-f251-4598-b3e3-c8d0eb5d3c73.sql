DROP POLICY IF EXISTS github_oauth_states_self_all ON public.github_oauth_states;
CREATE POLICY github_oauth_states_self_all ON public.github_oauth_states
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());