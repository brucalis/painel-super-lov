import { useEffect, useMemo, useState } from "react";
import { fetchCustomers, fetchLicenses, fmt, type Customer, type License } from "@/lib/licenses-data";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchCustomers().then(setCustomers).catch(() => {});
    fetchLicenses().then(setLicenses).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .map((c) => ({ ...c, licenses: licenses.filter((l) => l.customer_id === c.id) }))
      .filter((c) =>
        !q ? true : [c.email, c.full_name, c.phone, c.document].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [customers, licenses, search]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar cliente por nome, e-mail, telefone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Licenças</TableHead>
                <TableHead>Cadastro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Nenhum cliente cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="text-sm">{c.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.phone ?? "—"}
                    {c.document ? ` · ${c.document}` : ""}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.licenses.length ? c.licenses.map((l) => <div key={l.id}>{l.license_key}</div>) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmt(c.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
