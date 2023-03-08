<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>[% nodename %] - Proxmox Virtual Environment</title>
    <link rel="icon" sizes="128x128" href="/pve2/images/logo-128.png" />
    <link rel="apple-touch-icon" sizes="128x128" href="/pve2/images/logo-128.png" />
    <link rel="stylesheet" type="text/css" href="/pve2/ext6/theme-crisp/resources/theme-crisp-all.css?ver=7.0.0" />
    <link rel="stylesheet" type="text/css" href="/pve2/ext6/crisp/resources/charts-all.css?ver=7.0.0" />
    <link rel="stylesheet" type="text/css" href="/pve2/fa/css/font-awesome.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/ext6-pve.css?ver=[% version %]" />
    <link rel="stylesheet" type="text/css" href="/pwt/css/ext6-pmx.css?ver=[% wtversion %]" />
    [%- IF theme %]
      [%- IF theme == 'auto' %]
    <link rel="stylesheet" type="text/css" media="(prefers-color-scheme: dark)" href="/pwt/themes/theme-proxmox-dark.css?ver=[% wtversion %]" />
      [%- ELSE %]
    <link rel="stylesheet" type="text/css" href="/pwt/themes/theme-[% theme %].css?ver=[% wtversion %]" />
      [%- END -%]
    [%- END -%]

    [% IF langfile %]
    <script type='text/javascript' src='/pve2/locale/pve-lang-[% lang %].js?ver=[% version %]'></script>
    [%- ELSE %]
    <script type='text/javascript'>function gettext(buf) { return buf; }</script>
    [% END %]
    [%- IF debug %]
    <script type="text/javascript" src="/pve2/ext6/ext-all-debug.js?ver=7.0.0"></script>
    <script type="text/javascript" src="/pve2/ext6/charts-debug.js?ver=7.0.0"></script>
    [%- ELSE %]
    <script type="text/javascript" src="/pve2/ext6/ext-all.js?ver=7.0.0"></script>
    <script type="text/javascript" src="/pve2/ext6/charts.js?ver=7.0.0"></script>
    [% END %]
    <script type="text/javascript" src="/pve2/js/u2f-api.js"></script>
    <script type="text/javascript" src="/qrcode.min.js"></script>
    <script type="text/javascript">
    Proxmox = {
	Setup: { auth_cookie_name: 'PVEAuthCookie' },
	defaultLang: '[% lang %]',
	NodeName: '[% nodename %]',
	UserName: '[% username %]',
	CSRFPreventionToken: '[% token %]'
    };
    </script>
    <script type="text/javascript" src="/proxmoxlib.js?ver=[% wtversion %]"></script>
    <script type="text/javascript" src="/pve2/js/pvemanagerlib.js?ver=[% version %]"></script>
    <script type="text/javascript" src="/pve2/ext6/locale/locale-[% lang %].js?ver=7.0.0"></script>

    <script type="text/javascript">
    if (typeof(PVE) === 'undefined') PVE = {};
    Ext.History.fieldid = 'x-history-field';
    Ext.onReady(function() { Ext.create('PVE.StdWorkspace');});
    </script>

  </head>
  <body>
    <!-- Fields required for history management -->
    <form id="history-form" class="x-hidden">
    <input type="hidden" id="x-history-field"/>
    </form>
  </body>
</html>
