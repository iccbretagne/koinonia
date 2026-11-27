"use client";

import { useState } from "react";
import WelcomeDutyPoolClient from "./WelcomeDutyPoolClient";
import WelcomeDutyPlanningClient from "./WelcomeDutyPlanningClient";
import Tabs, { TabPanel } from "@/components/ui/Tabs";

type Tab = "pool" | "planning";

interface Props {
  readonly churchId: string;
}

export default function WelcomeDutyShell({ churchId }: Props) {
  const [tab, setTab] = useState<Tab>("planning");

  return (
    <div>
      <Tabs
        ariaLabel="Service d'accueil"
        idBase="welcome-duty"
        value={tab}
        onChange={setTab}
        className="mb-6"
        tabs={[
          { value: "planning", label: "Planning" },
          { value: "pool", label: "Pool de familles" },
        ]}
      />

      <TabPanel idBase="welcome-duty" value={tab}>
        {tab === "planning" ? <WelcomeDutyPlanningClient churchId={churchId} /> : <WelcomeDutyPoolClient />}
      </TabPanel>
    </div>
  );
}
