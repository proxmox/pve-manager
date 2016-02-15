 # this package will only be run in developpement mode, when extjs6=1 added
 # as extra parameter

package PVE::ExtJSIndex6;

use strict;
use warnings;

sub get_index {
    my ($lang, $username, $csrftoken, $console, $nodename) = @_;

    my $manager_source_dir = '/usr/share/pve-manager/manager6/';

#    # exit early to avoid this being run by mistake
    if ( ! -d $manager_source_dir) {
	return "$manager_source_dir not found";
    }

    my $page = <<_EOD;
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>$nodename - Proxmox Virtual Environment</title>
    <link rel="stylesheet" type="text/css" href="/pve2/ext6/theme-triton/resources/theme-triton-all.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/ext-pve.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/ext6-pve.css" />
    <script type="text/javascript" src="/pve2/ext6/ext-all-debug.js"></script>
_EOD

    my $langfile = "/usr/share/pve-manager/locale/pve-lang-${lang}.js";
    if (-f $langfile) {
	$page .= "<script type='text/javascript' src='/pve2/locale/pve-lang-${lang}.js'></script>";
    } else {
	$page .= '<script type="text/javascript">function gettext(buf) { return buf; }</script>';
    }

    # NB: ordering matters
    my $js_files =  <<_EOD;
Utils.js
Toolkit.js
Parser.js
StateProvider.js
button/Button.js
button/ConsoleButton.js
qemu/SendKeyMenu.js
qemu/CmdMenu.js
qemu/TemplateMenu.js
lxc/CmdMenu.js
VNCConsole.js
data/TimezoneStore.js
data/reader/JsonObject.js
data/PVEProxy.js
data/UpdateQueue.js
data/UpdateStore.js
data/DiffStore.js
data/ObjectStore.js
data/ResourceStore.js
form/VLanField.js
form/Checkbox.js
form/TextField.js
form/RRDTypeSelector.js
form/ComboGrid.js
form/KVComboBox.js
form/Boolean.js
form/CompressionSelector.js
form/PoolSelector.js
form/GroupSelector.js
form/UserSelector.js
form/RoleSelector.js
form/VMIDSelector.js
form/MemoryField.js
form/NetworkCardSelector.js
form/DiskFormatSelector.js
form/BusTypeSelector.js
form/ControllerSelector.js
form/EmailNotificationSelector.js
form/RealmComboBox.js
form/BondModeSelector.js
form/ViewSelector.js
form/NodeSelector.js
form/FileSelector.js
form/StorageSelector.js
form/BridgeSelector.js
form/SecurityGroupSelector.js
form/IPRefSelector.js
form/IPProtocolSelector.js
form/CPUModelSelector.js
form/VNCKeyboardSelector.js
form/LanguageSelector.js
form/DisplaySelector.js
form/CacheTypeSelector.js
form/SnapshotSelector.js
form/ContentTypeSelector.js
form/HotplugFeatureSelector.js
form/iScsiProviderSelector.js
form/DayOfWeekSelector.js
form/BackupModeSelector.js
form/ScsiHwSelector.js
form/FirewallPolicySelector.js
form/QemuBiosSelector.js
dc/Tasks.js
dc/Log.js
panel/StatusPanel.js
panel/RRDView.js
panel/InputPanel.js
window/Edit.js
window/LoginWindow.js
window/TaskViewer.js
window/Wizard.js
window/NotesEdit.js
window/Backup.js
window/Restore.js
panel/NotesView.js
grid/CheckColumn.js
grid/SelectFeature.js
grid/ObjectGrid.js
grid/PendingObjectGrid.js
grid/ResourceGrid.js
grid/PoolMembers.js
grid/FirewallRules.js
grid/FirewallAliases.js
grid/FirewallOptions.js
tree/ResourceTree.js
panel/IPSet.js
panel/ConfigPanel.js
panel/SubConfigPanel.js
grid/BackupView.js
panel/LogView.js
panel/Firewall.js
ceph/Pool.js
ceph/OSD.js
ceph/Disks.js
ceph/Monitor.js
ceph/Crush.js
ceph/Status.js
ceph/Config.js
node/DNSEdit.js
node/DNSView.js
node/TimeView.js
node/TimeEdit.js
node/StatusView.js
node/Summary.js
node/ServiceView.js
node/NetworkEdit.js
node/NetworkView.js
node/Tasks.js
node/Subscription.js
node/APT.js
node/Config.js
qemu/StatusView.js
window/Migrate.js
window/MigrateAll.js
qemu/Monitor.js
qemu/Summary.js
qemu/OSTypeEdit.js
qemu/ProcessorEdit.js
qemu/BootOrderEdit.js
qemu/MemoryEdit.js
qemu/NetworkEdit.js
qemu/Smbios1Edit.js
qemu/CDEdit.js
qemu/HDEdit.js
qemu/HDResize.js
qemu/HDMove.js
qemu/HDThrottle.js
qemu/CPUOptions.js
qemu/DisplayEdit.js
qemu/KeyboardEdit.js
qemu/HardwareView.js
qemu/StartupEdit.js
qemu/ScsiHwEdit.js
qemu/QemuBiosEdit.js
qemu/Options.js
qemu/Snapshot.js
qemu/Clone.js
qemu/SnapshotTree.js
qemu/Config.js
qemu/CreateWizard.js
lxc/StatusView.js
lxc/Summary.js
lxc/Network.js
lxc/Resources.js
lxc/Options.js
lxc/DNS.js
lxc/Config.js
lxc/CreateWizard.js
lxc/SnapshotTree.js
lxc/Snapshot.js
lxc/ResourceEdit.js
lxc/MPResize.js
pool/StatusView.js
pool/Summary.js
pool/Config.js
storage/ContentView.js
storage/StatusView.js
storage/Summary.js
storage/Browser.js
storage/DirEdit.js
storage/NFSEdit.js
storage/GlusterFsEdit.js
storage/IScsiEdit.js
storage/LVMEdit.js
storage/RBDEdit.js
storage/SheepdogEdit.js
storage/ZFSEdit.js
storage/ZFSPoolEdit.js
ha/StatusView.js
ha/GroupSelector.js
ha/ResourceEdit.js
ha/Resources.js
ha/GroupEdit.js
ha/Groups.js
ha/Fencing.js
ha/Config.js
dc/Summary.js
dc/OptionView.js
dc/StorageView.js
dc/UserEdit.js
dc/UserView.js
dc/PoolView.js
dc/PoolEdit.js
dc/GroupView.js
dc/GroupEdit.js
dc/RoleView.js
dc/ACLView.js
dc/AuthView.js
dc/AuthEdit.js
dc/Backup.js
dc/Support.js
dc/SecurityGroups.js
dc/Config.js
Workspace.js
_EOD

    my @files_array = split('\n', $js_files);
    my $prefix = '<script type="text/javascript" src="/pve2/manager6/';
    my $postifx = '"></script>';
    my $include_file = '';

    foreach my $file (@files_array) {
    	if (-e $manager_source_dir . '/' . $file) {
    		# will build <script type="text/javascript" src="/pve2/manager6/Workspace.js"></script>
    		my $include_line = join('', "    ", $prefix, $file, $postifx);
    		$include_file = join("\n", $include_file ,$include_line);
    	}
    }

    $page .= $include_file . "\n";

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
