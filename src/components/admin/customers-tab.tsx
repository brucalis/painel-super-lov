import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchCustomers, fetchLicenses, fmt, type Customer, type License } from "@/lib/licenses-data";
import { deleteCustomer } from "@/lib/licenses.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const removeCustomer = useServerFn(deleteCustomer);

  async function load() {
    const [nextCustomers, nextLicenses] = await Promise.all([fetchCustomers(), fetchLicenses()]);
    setCustomers(nextCustomers);
    setLicenses(nextLicenses);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function remove(customer: Customer) {
    setDeletingId(customer.id);
    try {
      await removeCustomer({ data: { customer_id: customer.id } });
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      setLicenses((current) => current.map((license) =>
        license.customer_id === customer.id ? { ...license, customer_id: null, customers: null } : license
      ));
      toast.success("Cadastro do cliente excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o cliente.");
    } finally {
      setDeletingId(null);
    }
  }

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
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
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
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={deletingId === c.id}>
                          <Trash2 className="mr-1 h-4 w-4" /> Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir cadastro do cliente?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O cadastro de {c.full_name || c.email} será removido. {c.licenses.length
                              ? `${c.licenses.length} licença${c.licenses.length === 1 ? "" : "s"} vinculada${c.licenses.length === 1 ? " será preservada" : "s serão preservadas"} no histórico, mas ficará${c.licenses.length === 1 ? "" : "ão"} sem cliente associado.`
                              : "Nenhuma licença está vinculada a este cadastro."} Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove(c)}>
                            Excluir cliente
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
