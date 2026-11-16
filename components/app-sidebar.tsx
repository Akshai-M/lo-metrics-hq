"use client";

import Link from "next/link";
import { BarChart3, GraduationCap, Layers, LayoutDashboard, Table2 } from "lucide-react";
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
};

export function AppSidebar({ active, hrefs }: { active: Tab; hrefs: Record<Tab, string> }) {
  const { setOpenMobile } = useSidebar();
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
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <p className="px-2 pb-1 text-xs text-muted-foreground">Online + offline. TR and internships coming next.</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
