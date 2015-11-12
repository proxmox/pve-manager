package PVE::ExtJSIndex6;

use strict;
use warnings;

sub get_index {
    my ($lang, $username, $csrftoken, $console) = @_;

    my $page = <<_EOD;
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>Proxmox Virtual Environment</title>
    <link rel="stylesheet" type="text/css" href="/pve2/ext6/theme-triton/resources/theme-triton-all.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/ext-pve.css" />
_EOD

    my $langfile = "/usr/share/pve-manager/locale/pve-lang-${lang}.js";
    if (-f $langfile) {
	$page .= "<script type='text/javascript' src='/pve2/locale/pve-lang-${lang}.js'></script>";
    } else {
	$page .= '<script type="text/javascript">function gettext(buf) { return buf; }</script>';
    }

    $page .= <<_EOD;
    <script type="text/javascript" src="/pve2/ext6/ext-all-debug.js"></script>

    <script type="text/javascript" src="/pve2/manager6/Utils.js"></script>
    <script type="text/javascript" src="/pve2/manager6/Toolkit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/Parser.js"></script>
    <script type="text/javascript" src="/pve2/manager6/StateProvider.js"></script>
    <script type="text/javascript" src="/pve2/manager6/button/Button.js"></script>
    <script type="text/javascript" src="/pve2/manager6/button/ConsoleButton.js"></script>
<!--
    <script type="text/javascript" src="/pve2/manager6/qemu/SendKeyMenu.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/CmdMenu.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/TemplateMenu.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/CmdMenu.js"></script>
-->
    <script type="text/javascript" src="/pve2/manager6/VNCConsole.js"></script>
    <script type="text/javascript" src="/pve2/manager6/data/TimezoneStore.js"></script>
    <script type="text/javascript" src="/pve2/manager6/data/reader/JsonObject.js"></script>
    <script type="text/javascript" src="/pve2/manager6/data/PVEProxy.js"></script>
    <script type="text/javascript" src="/pve2/manager6/data/UpdateQueue.js"></script>
    <script type="text/javascript" src="/pve2/manager6/data/UpdateStore.js"></script>
    <script type="text/javascript" src="/pve2/manager6/data/DiffStore.js"></script>
    <script type="text/javascript" src="/pve2/manager6/data/ObjectStore.js"></script>
    <script type="text/javascript" src="/pve2/manager6/data/ResourceStore.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/VLanField.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/Checkbox.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/TextField.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/RRDTypeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/ComboGrid.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/KVComboBox.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/Boolean.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/CompressionSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/PoolSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/GroupSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/UserSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/RoleSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/VMIDSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/MemoryField.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/NetworkCardSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/DiskFormatSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/BusTypeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/ControllerSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/EmailNotificationSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/RealmComboBox.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/BondModeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/ViewSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/NodeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/FileSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/StorageSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/BridgeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/SecurityGroupSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/IPRefSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/IPProtocolSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/CPUModelSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/VNCKeyboardSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/LanguageSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/DisplaySelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/CacheTypeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/SnapshotSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/ContentTypeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/HotplugFeatureSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/iScsiProviderSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/DayOfWeekSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/BackupModeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/ScsiHwSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/form/FirewallPolicySelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/Tasks.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/Log.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/StatusPanel.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/RRDView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/InputPanel.js"></script>
    <script type="text/javascript" src="/pve2/manager6/window/Edit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/window/LoginWindow.js"></script>
    <script type="text/javascript" src="/pve2/manager6/window/TaskViewer.js"></script>
    <script type="text/javascript" src="/pve2/manager6/window/Wizard.js"></script>
    <script type="text/javascript" src="/pve2/manager6/window/NotesEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/window/Backup.js"></script>
    <script type="text/javascript" src="/pve2/manager6/window/Restore.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/NotesView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/CheckColumn.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/SelectFeature.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/ObjectGrid.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/PendingObjectGrid.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/ResourceGrid.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/PoolMembers.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/FirewallRules.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/FirewallAliases.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/FirewallOptions.js"></script>
    <script type="text/javascript" src="/pve2/manager6/tree/ResourceTree.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/IPSet.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/ConfigPanel.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/SubConfigPanel.js"></script>
    <script type="text/javascript" src="/pve2/manager6/grid/BackupView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/LogView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/panel/Firewall.js"></script>
<!--
    <script type="text/javascript" src="/pve2/manager6/ceph/Pool.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ceph/OSD.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ceph/Disks.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ceph/Monitor.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ceph/Crush.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ceph/Status.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ceph/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/DNSEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/DNSView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/TimeView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/TimeEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/ServiceView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/NetworkEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/NetworkView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/Tasks.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/Subscription.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/APT.js"></script>
    <script type="text/javascript" src="/pve2/manager6/node/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/StatusView.js"></script>
-->
    <script type="text/javascript" src="/pve2/manager6/window/Migrate.js"></script>
    <script type="text/javascript" src="/pve2/manager6/window/MigrateAll.js"></script>
<!--
    <script type="text/javascript" src="/pve2/manager6/qemu/Monitor.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/OSTypeEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/ProcessorEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/BootOrderEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/MemoryEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/NetworkEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/Smbios1Edit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/CDEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/HDEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/HDResize.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/HDMove.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/HDThrottle.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/CPUOptions.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/DisplayEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/KeyboardEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/HardwareView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/StartupEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/ScsiHwEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/Options.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/Snapshot.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/Clone.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/SnapshotTree.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager6/qemu/CreateWizard.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/Network.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/Resources.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/Options.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/DNS.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager6/lxc/CreateWizard.js"></script>
-->
    <script type="text/javascript" src="/pve2/manager6/pool/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/pool/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager6/pool/Config.js"></script>
<!--
    <script type="text/javascript" src="/pve2/manager6/storage/ContentView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/Browser.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/DirEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/NFSEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/GlusterFsEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/IScsiEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/LVMEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/RBDEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/SheepdogEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/ZFSEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/storage/ZFSPoolEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ha/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ha/GroupSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ha/ResourceEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ha/Resources.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ha/GroupEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ha/Groups.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ha/Fencing.js"></script>
    <script type="text/javascript" src="/pve2/manager6/ha/Config.js"></script>
-->
    <script type="text/javascript" src="/pve2/manager6/dc/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/OptionView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/StorageView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/UserEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/UserView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/PoolView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/PoolEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/GroupView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/GroupEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/RoleView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/ACLView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/AuthView.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/AuthEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/Backup.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/Support.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/SecurityGroups.js"></script>
    <script type="text/javascript" src="/pve2/manager6/dc/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager6/Workspace.js"></script>
_EOD

    my $jssrc = <<_EOJS;
if (typeof(PVE) === 'undefined') PVE = {};
PVE.UserName = '$username'
PVE.CSRFPreventionToken = '$csrftoken';
_EOJS

    my $workspace = defined($console) ?
	"PVE.ConsoleWorkspace" : "PVE.StdWorkspace";

   $jssrc .= <<_EOJS;
// we need this (the java applet ignores the zindex)
Ext.useShims = true;
Ext.History.fieldid = 'x-history-field';
Ext.onReady(function() {
	console.log(Ext.getVersion().version);
	Ext.create('$workspace');
});
_EOJS

    $page .= <<_EOD;
    <script type="text/javascript">$jssrc</script>
    
  </head>
  <body>
    <!-- Fields required for history management -->
    <form id="history-form" class="x-hidden">
    <input type="hidden" id="x-history-field"/>
    </form>
  </body>
</html>
_EOD
   
    return $page;

}

1;
