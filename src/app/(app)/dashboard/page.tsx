import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertCircle, Clock } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Friday Banner Example (Hardcoded for visual structure) */}
      <div className="bg-(--rs-accent-100) border border-(--rs-accent-300) text-(--rs-accent-700) px-4 py-3 rounded-md flex items-center gap-3 font-medium">
        <AlertCircle className="w-5 h-5" />
        Weekly report due today at 11:59pm
      </div>

      {/* Project Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { code: "C1", name: "Romega Digital", tasks: 12, done: 3, prog: 4, blocked: 0 },
          { code: "C2", name: "PinayMate", tasks: 5, done: 1, prog: 1, blocked: 1 },
          { code: "C3", name: "Internal Tools", tasks: 22, done: 8, prog: 4, blocked: 0 },
          { code: "C4", name: "Upskilling", tasks: 3, done: 0, prog: 0, blocked: 0 }
        ].map((p) => (
          <Card key={p.code} className="hover:border-(--rs-primary-300) transition-colors cursor-pointer border-t-4 border-t-(--rs-primary-500)">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{p.code}</CardTitle>
              <div className="text-lg font-bold text-(--rs-neutral-grey-900)">{p.name}</div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-end">
                <div className="text-2xl font-bold">{p.tasks}</div>
                <div className="text-xs text-slate-500 text-right space-y-0.5">
                  <div className="text-green-600 font-medium">{p.done} done</div>
                  {p.blocked > 0 && <div className="text-red-500 font-medium">{p.blocked} blocked</div>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Grid: My Tasks & Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-t-4 border-t-(--rs-accent-500)">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-serif">My Tasks</CardTitle>
            <button className="text-sm text-(--rs-primary-500) hover:underline font-medium">View All &rarr;</button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { title: "Fix security vulnerability", due: "Apr 15", priority: "🔴", status: "todo" },
                { title: "Build careers page UI", due: "Apr 22", priority: "🟡", status: "in_progress" },
                { title: "Services IA redesign", due: "Apr 30", priority: "🟢", status: "todo" },
              ].map((t, i) => (
                <div key={i} className="flex items-start justify-between p-2 hover:bg-slate-50 rounded-md border border-transparent hover:border-slate-100 group">
                  <div className="flex items-center gap-3">
                    <div className="mt-0.5 text-slate-400 group-hover:text-(--rs-primary-500)">
                      <div className="w-4 h-4 rounded border border-slate-300 bg-white" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-(--rs-neutral-grey-900)">{t.priority} {t.title}</div>
                      <div className="text-xs text-slate-500">{t.due}</div>
                    </div>
                  </div>
                  <div className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                    {t.status === 'in_progress' ? 'In Progress' : 'To Do'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" /> Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pt-2">
              <div className="flex gap-4 items-start">
                <div className="bg-orange-100 text-orange-700 w-12 text-center rounded-md overflow-hidden shrink-0">
                  <div className="text-[10px] font-bold uppercase bg-orange-200 py-0.5">Apr</div>
                  <div className="text-lg font-bold py-1">15</div>
                </div>
                <div>
                  <div className="font-medium text-(--rs-neutral-grey-900)">MVP Deploy</div>
                  <div className="text-sm text-slate-500">C2 - PinayMate • @Ken</div>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="bg-slate-100 text-slate-700 w-12 text-center rounded-md overflow-hidden shrink-0">
                  <div className="text-[10px] font-bold uppercase bg-slate-200 py-0.5">Apr</div>
                  <div className="text-lg font-bold py-1">22</div>
                </div>
                <div>
                  <div className="font-medium text-(--rs-neutral-grey-900)">Wrap-up doc</div>
                  <div className="text-sm text-slate-500">C2 - PinayMate • @Ken</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid: Workload & Blockers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif">Team Workload</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pt-2">
              {[
                { name: "Mark", load: 8, max: 15, color: "bg-(--rs-primary-500)" },
                { name: "Ken", load: 14, max: 15, color: "bg-red-500" },
                { name: "Mich", load: 2, max: 15, color: "bg-green-500" }
              ].map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="w-12 text-sm font-medium text-right text-slate-600">{p.name}</div>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${p.color}`} style={{ width: `${(p.load / p.max) * 100}%` }} />
                  </div>
                  <div className="w-6 text-sm text-slate-500 font-bold">{p.load}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" /> Active Blockers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-100 rounded-md">
                <div className="font-medium text-red-800 text-sm">Pricing visibility conflict</div>
                <div className="text-xs text-red-600 mt-1">Blocks: C1 Digital Marketing page build</div>
              </div>
              <div className="p-3 bg-red-50 border border-red-100 rounded-md">
                <div className="font-medium text-red-800 text-sm">Website approach decision</div>
                <div className="text-xs text-red-600 mt-1">Blocks: C1 All website build tasks (Waiting on Robbie)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
