-- Cadastro atômico e não destrutivo de OPs vindas do PDF ou do Microdata.
create schema if not exists ibicolors_private;
revoke all on schema ibicolors_private from public,anon,authenticated;

create or replace function ibicolors_private.cadastrar_op_nova(p_usuario_id uuid,p_op jsonb,p_origem text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_profile public.perfil_usuario;v_existing public.ordens_producao%rowtype;v_id uuid;v_item jsonb;v_sequence integer:=0;v_has_history boolean;
begin
 select perfil into v_profile from public.perfis where id=p_usuario_id and ativo;
 if v_profile is null then raise exception 'Usuário sem perfil ativo.';end if;
 if p_origem='pdf' and v_profile not in('admin','pcp','lider') then raise exception 'Somente administradores podem importar PDF.';end if;
 if p_origem='microdata_api' and v_profile='consulta' then raise exception 'Perfil de consulta não pode cadastrar OP.';end if;
 if coalesce(p_op->>'numero_op','')!~'^\d{1,20}$' then raise exception 'Número da OP inválido.';end if;
 if nullif(trim(p_op->>'cliente'),'') is null or nullif(trim(p_op->>'artigo'),'') is null then raise exception 'Cliente e artigo são obrigatórios.';end if;
 if jsonb_typeof(p_op->'operacoes')<>'array' or jsonb_array_length(p_op->'operacoes')<1 then raise exception 'A OP precisa possuir roteiro produtivo.';end if;
 if (p_op->>'prazo_dias') is not null and ((p_op->>'prazo_dias')::integer<0 or (p_op->>'prazo_dias')::integer>3650) then raise exception 'Prazo inválido.';end if;

 perform pg_advisory_xact_lock(hashtextextended(p_op->>'numero_op',0));
 select * into v_existing from public.ordens_producao where numero_op=p_op->>'numero_op';
 if found then
  select exists(select 1 from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=v_existing.id) into v_has_history;
  return jsonb_build_object('status',case when v_existing.encerrada_em is not null then 'existing_closed' when v_has_history then 'existing_with_history' else 'existing' end,'order_id',v_existing.id,'numero_op',v_existing.numero_op,'message',case when v_existing.encerrada_em is not null then 'Esta OP já está cadastrada e encerrada. O encerramento e o histórico foram preservados.' when v_has_history then 'Esta OP já está cadastrada e possui histórico produtivo. Os dados existentes foram preservados.' else 'Esta OP já está cadastrada. Nenhum dado foi alterado.' end);
 end if;

 insert into public.ordens_producao(numero_op,cliente,nf_entrada,data_op,codigo_artigo,artigo,pecas,metros,peso,prazo_dias,status,criado_por,dados_extraidos)
 values(p_op->>'numero_op',trim(p_op->>'cliente'),nullif(trim(p_op->>'nf_entrada'),''),nullif(p_op->>'data_op','')::date,nullif(trim(p_op->>'codigo_artigo'),''),trim(p_op->>'artigo'),coalesce((p_op->>'pecas')::integer,0),coalesce((p_op->>'metros')::numeric,0),coalesce((p_op->>'peso')::numeric,0),nullif(p_op->>'prazo_dias','')::integer,'aguardando',p_usuario_id,coalesce(p_op->'dados_extraidos','{}'::jsonb)) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_op->'operacoes') loop
  v_sequence:=v_sequence+1;
  if coalesce(v_item->>'codigo','')!~'^\d{4}$' or nullif(trim(v_item->>'descricao'),'') is null then raise exception 'Operação inválida na posição %.',v_sequence;end if;
  insert into public.operacoes(ordem_producao_id,sequencia,codigo,descricao,status) values(v_id,v_sequence,v_item->>'codigo',trim(v_item->>'descricao'),(case when v_sequence=1 then 'liberada' else 'aguardando' end)::public.status_operacao);
 end loop;
 return jsonb_build_object('status','created','order_id',v_id,'numero_op',p_op->>'numero_op','message','OP cadastrada e liberada para apontamento.');
exception when unique_violation then
 select * into v_existing from public.ordens_producao where numero_op=p_op->>'numero_op';
 return jsonb_build_object('status','existing','order_id',v_existing.id,'numero_op',v_existing.numero_op,'message','Esta OP já está cadastrada. Nenhum dado foi alterado.');
end;$$;

create or replace function public.cadastrar_op_pdf_seguro(p_op jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin return ibicolors_private.cadastrar_op_nova(auth.uid(),p_op,'pdf');end;$$;

create or replace function public.cadastrar_op_microdata_backend(p_usuario_id uuid,p_op jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(p_op#>>'{dados_extraidos,origem}','')<>'microdata_api' then raise exception 'Origem Microdata inválida.';end if;
 return ibicolors_private.cadastrar_op_nova(p_usuario_id,p_op,'microdata_api');
end;$$;

revoke all on function ibicolors_private.cadastrar_op_nova(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.cadastrar_op_pdf_seguro(jsonb) from public,anon;
grant execute on function public.cadastrar_op_pdf_seguro(jsonb) to authenticated;
revoke all on function public.cadastrar_op_microdata_backend(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cadastrar_op_microdata_backend(uuid,jsonb) to service_role;
