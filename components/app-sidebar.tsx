"use client";

import { BarChart3, GraduationCap, Layers, LayoutDashboard, LogOut, Table2, UserRound, Activity, Briefcase, Timer, Users } from "lucide-react";
import { useSignOut } from "@/components/auth-forms";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
  reattempts: Timer,
  outcomes: Briefcase,
  students: Users,
  health: Activity,
};

/** Tabs switch in the browser (no navigation); hovering a tab preloads its data. */
export function AppSidebar({
  active,
  user,
  onSelect,
  onPrefetch,
}: {
  active: Tab;
  user: string;
  onSelect: (tab: Tab) => void;
  onPrefetch?: (tab: Tab) => void;
}) {
  const { setOpenMobile } = useSidebar();
  const signOut = useSignOut();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </div>
          <div className="min-w-0 truncate font-semibold whitespace-nowrap group-data-[collapsible=icon]:hidden">
            LO Metrics HQ<span className="text-primary">.</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {TABS.map((t) => {
                const Icon = ICONS[t.key];
                return (
                  <SidebarMenuItem key={t.key}>
                    <SidebarMenuButton
                      isActive={t.key === active}
                      tooltip={t.label}
                      onClick={() => {
                        onSelect(t.key);
                        setOpenMobile(false);
                      }}
                      onMouseEnter={() => onPrefetch?.(t.key)}
                      onFocus={() => onPrefetch?.(t.key)}
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
