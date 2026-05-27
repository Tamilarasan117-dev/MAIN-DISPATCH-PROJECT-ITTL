-- Fix: Profiles RLS Infinite Recursion
-- The "Secure authenticated access" policy on public.profiles was causing infinite recursion 
-- because evaluating it required selecting from the profiles table itself, which re-triggered the policy.

-- 1. Drop the recursive policy on the profiles table
DROP POLICY IF EXISTS "Secure authenticated access" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated all access" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.profiles;

-- 2. Create non-recursive policies for the profiles table
-- SELECT: Allow all authenticated users to read profiles (needed for dashboard, role assignment, and logs)
CREATE POLICY "Allow authenticated select on profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- INSERT: Allow authenticated users to create their own profile (used during sign-up)
CREATE POLICY "Allow authenticated insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = (select auth.uid()));

-- UPDATE: Allow users to update their own profile, or Admins/Supervisors to update profiles
CREATE POLICY "Allow authenticated update profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    id = (select auth.uid()) 
    OR 
    (SELECT role FROM public.profiles WHERE id = (select auth.uid())) IN ('Admin', 'SuperAdmin', 'DispatchAdmin')
)
WITH CHECK (
    id = (select auth.uid()) 
    OR 
    (SELECT role FROM public.profiles WHERE id = (select auth.uid())) IN ('Admin', 'SuperAdmin', 'DispatchAdmin')
);

-- DELETE: Allow users to delete their own profile, or Admins to delete profiles
CREATE POLICY "Allow authenticated delete profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (
    id = (select auth.uid()) 
    OR 
    (SELECT role FROM public.profiles WHERE id = (select auth.uid())) IN ('Admin', 'SuperAdmin', 'DispatchAdmin')
);
