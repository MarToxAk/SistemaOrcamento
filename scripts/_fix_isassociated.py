c = open('apps/backend/src/modules/quotes/quotes.service.ts', encoding='utf-8').read()

# 1. Expand customer type to include isAssociated
old_cust_type = '    customer: { fullName: string; phone: string | null; email: string | null };'
new_cust_type = '    customer: { fullName: string; phone: string | null; email: string | null; isAssociated?: boolean };'
assert old_cust_type in c, 'customer type not found'
c = c.replace(old_cust_type, new_cust_type, 1)

# 2. Add isAssociated to return object (after approvedAt line)
old_approved = '      approvedAt: quote.approvedAt ? quote.approvedAt.toISOString() : null,'
new_approved = '      approvedAt: quote.approvedAt ? quote.approvedAt.toISOString() : null,\n      isAssociated: Boolean((quote.customer as any).isAssociated ?? false),'
assert old_approved in c, 'approvedAt line not found'
c = c.replace(old_approved, new_approved, 1)

# 3. Filter __associated__ from observacoes in body
magic = '__associated__'
old_obs = '        observacoes: quote.notes,'
new_obs = '        observacoes: quote.notes === "' + magic + '" ? null : quote.notes,'
assert old_obs in c, 'observacoes line not found'
c = c.replace(old_obs, new_obs, 1)

open('apps/backend/src/modules/quotes/quotes.service.ts', 'w', encoding='utf-8', newline='\n').write(c)
print('done')
