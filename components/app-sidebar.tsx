"use client";

import Link from "next/link";
import { BarChart3, GraduationCap, Layers, LayoutDashboard, LogOut, Table2, UserRound, Activity } from "lucide-react";
import { useSignOut } from "@/components/auth-forms";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import { TABS, type Tab } from "@/lib/tabs";

const ICONS: Record<Tab, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  splits: Table2,
  yog: GraduationCap,
  competency: BarChart3,
  health: Activity,
};

export function AppSidebar({ active, hrefs, user }: { active: Tab; hrefs: Record<Tab, string>; user: string }) {
  const { setOpenMobile } = useSidebar();
  const signOut = useSignOut();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </div>
          <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <div className="truncate font-semibold">
              LO Metrics HQ<span className="text-primary">.</span>
            </div>
            <div className="eyebrow truncate">ACD LO</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="eyebrow">FT competency</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TABS.map((t) => {
                const Icon = ICONS[t.key];
                return (
                  <SidebarMenuItem key={t.key}>
                    <SidebarMenuButton
                      isActive={t.key === active}
                      tooltip={t.label}
                      render={<Link href={hrefs[t.key]} onClick={() => setOpenMobile(false)} />}
                    >
                      <Icon />
                      <span>{t.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          Online, offline and TR. Internships coming next.
        </p>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm group-data-[collapsible=icon]:hidden">
              <UserRound className="size-4 text-muted-foreground" />
              <span className="truncate font-medium">{user}</span>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign out" onClick={signOut}>
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
