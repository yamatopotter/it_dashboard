# QUALIDADE DOS LINKS - detecta DEGRADACAO (perda e latencia) sem trocar rota.
# Queda total continua sendo tratada pelo netwatch (wipi-down / tim-down).
# Limites: perda >= 3 em 10 pings OU latencia media > 150 ms, por 2 execucoes seguidas (10 min).
# Para testar: defina as globais QLRTTMAX (ms) e QLTESTE "1" antes de rodar.
:global QLWIPI
:global QLTIM
:global QLRTTMAX
:global QLTESTE
:if ([:typeof $QLWIPI] != "num") do={ :set QLWIPI 0 }
:if ([:typeof $QLTIM] != "num") do={ :set QLTIM 0 }
:local rttmax 150
:if ([:typeof $QLRTTMAX] = "num") do={ :set rttmax $QLRTTMAX }
:local pref ""
:if ([:typeof $QLTESTE] = "str") do={ :set pref "[TESTE] " }

# mede 10 pings pela interface do link; devolve "perdidos;latencia_media_ms"
:local chk do={
  :local lost 0
  :local tok 0
  :local tsum 0
  :for p from=1 to=10 do={
    :local t0 [:timestamp]
    :if ([/ping address=$h interface=$i count=1] = 1) do={
      :set tok ($tok + 1)
      :set tsum ($tsum + ([:tonsec ([:timestamp] - $t0)] / 1000000))
    } else={ :set lost ($lost + 1) }
    :delay 300ms
  }
  :local avg 0
  :if ($tok > 0) do={ :set avg ($tsum / $tok) }
  :return "$lost;$avg"
}

# envia e-mail com ate 3 tentativas (a resolucao de nomes pode falhar logo apos troca de rota)
:local mail do={
  :local sent false
  :local attempt 0
  :while (!$sent && $attempt < 3) do={
    :set attempt ($attempt + 1)
    :do {
      /tool e-mail send to="tecnologia@evorafarma.com.br" subject=$subj body=$body
      :set sent true
    } on-error={ :delay 15s }
  }
  :if (!$sent) do={ /log warning message="[QUALIDADE] Nao foi possivel enviar e-mail ($subj)" }
}

# ---- WIPI (primario)
:local r [$chk h="199.7.83.42" i="vlan211-WAN-WIPI"]
:local lost [:tonum [:pick $r 0 [:find $r ";"]]]
:local avg [:tonum [:pick $r ([:find $r ";"] + 1) [:len $r]]]
:if ($lost >= 10) do={
  :set QLWIPI 0
} else={
  :if ($lost >= 3 || $avg > $rttmax) do={
    :set QLWIPI ($QLWIPI + 1)
    /log warning message="[QUALIDADE] WIPI degradada ($lost/10 perdas, latencia media $avg ms) - ocorrencia $QLWIPI"
    :if ($QLWIPI = 2) do={
      [$mail subj=($pref . "[ALERTA] Barra da Tijuca - Link WIPI degradado") body=("O link WIPI (primario) esta com qualidade ruim: $lost de 10 pings perdidos e latencia media de $avg ms, por 2 verificacoes seguidas. O link continua em uso; nenhuma rota foi alterada.")]
    }
  } else={
    :if ($QLWIPI >= 2) do={
      /log info message="[QUALIDADE] WIPI normalizada"
      [$mail subj=($pref . "[INFO] Barra da Tijuca - Link WIPI normalizado") body="A qualidade do link WIPI voltou ao normal."]
    }
    :set QLWIPI 0
  }
}

# ---- TIM (secundario)
:local r2 [$chk h="192.5.5.241" i="ether1-WAN-TIM"]
:local lost2 [:tonum [:pick $r2 0 [:find $r2 ";"]]]
:local avg2 [:tonum [:pick $r2 ([:find $r2 ";"] + 1) [:len $r2]]]
:if ($lost2 >= 10) do={
  :set QLTIM 0
} else={
  :if ($lost2 >= 3 || $avg2 > $rttmax) do={
    :set QLTIM ($QLTIM + 1)
    /log warning message="[QUALIDADE] TIM degradada ($lost2/10 perdas, latencia media $avg2 ms) - ocorrencia $QLTIM"
    :if ($QLTIM = 2) do={
      [$mail subj=($pref . "[ALERTA] Barra da Tijuca - Link TIM degradado") body=("O link TIM (secundario) esta com qualidade ruim: $lost2 de 10 pings perdidos e latencia media de $avg2 ms, por 2 verificacoes seguidas. Nenhuma rota foi alterada.")]
    }
  } else={
    :if ($QLTIM >= 2) do={
      /log info message="[QUALIDADE] TIM normalizada"
      [$mail subj=($pref . "[INFO] Barra da Tijuca - Link TIM normalizado") body="A qualidade do link TIM voltou ao normal."]
    }
    :set QLTIM 0
  }
}
