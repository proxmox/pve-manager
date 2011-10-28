include ../../defines.mk

JSSRC= 				                 	\
	Utils.js					\
	Parser.js					\
	StateProvider.js				\
	qemu/SendKeyMenu.js				\
	VNCConsole.js					\
	data/TimezoneStore.js				\
	data/reader/JsonObject.js			\
	data/PVEProxy.js				\
	data/UpdateQueue.js				\
	data/UpdateStore.js				\
	data/DiffStore.js				\
	data/ObjectStore.js				\
	data/ResourceStore.js				\
	form/Checkbox.js				\
	form/TextField.js				\
	form/RRDTypeSelector.js				\
	form/ComboGrid.js				\
	form/KVComboBox.js				\
	form/Boolean.js					\
	form/NetworkCardSelector.js			\
	form/DiskFormatSelector.js			\
	form/BusTypeSelector.js				\
	form/ControllerSelector.js			\
	form/RealmComboBox.js				\
	form/BondModeSelector.js			\
	form/ViewSelector.js				\
	form/NodeSelector.js				\
	form/FileSelector.js				\
	form/StorageSelector.js				\
	form/BridgeSelector.js				\
	form/CPUModelSelector.js			\
	form/VNCKeyboardSelector.js			\
	form/LanguageSelector.js			\
	form/DisplaySelector.js				\
	form/CacheTypeSelector.js			\
	form/ContentTypeSelector.js			\
	form/DayOfWeekSelector.js			\
	form/BackupModeSelector.js			\
	dc/Tasks.js					\
	dc/Log.js					\
	panel/StatusPanel.js				\
	panel/RRDView.js				\
	panel/InputPanel.js				\
	window/Edit.js					\
	window/LoginWindow.js				\
	window/TaskViewer.js				\
	window/Wizard.js				\
	window/NotesEdit.js				\
	window/Backup.js				\
	panel/NotesView.js				\
	grid/SelectFeature.js				\
	grid/ObjectGrid.js				\
	grid/ResourceGrid.js				\
	tree/ResourceTree.js				\
	panel/ConfigPanel.js				\
	grid/BackupView.js				\
	node/DNSEdit.js					\
	node/DNSView.js					\
	node/TimeView.js				\
	node/TimeEdit.js				\
	node/StatusView.js				\
	node/BCFailCnt.js				\
	node/Summary.js					\
	node/ServiceView.js				\
	node/NetworkEdit.js				\
	node/NetworkView.js				\
	node/Syslog.js					\
	node/Tasks.js					\
	node/Config.js					\
	qemu/StatusView.js				\
	qemu/Migrate.js					\
	qemu/Summary.js					\
	qemu/OSTypeEdit.js				\
	qemu/ProcessorEdit.js				\
	qemu/BootOrderEdit.js				\
	qemu/MemoryEdit.js				\
	qemu/NetworkEdit.js				\
	qemu/CDEdit.js					\
	qemu/HDEdit.js					\
	qemu/DisplayEdit.js				\
	qemu/KeyboardEdit.js				\
	qemu/HardwareView.js				\
	qemu/Options.js					\
	qemu/Config.js					\
	qemu/CreateWizard.js				\
	openvz/StatusView.js				\
	openvz/Summary.js				\
	openvz/RessourceEdit.js				\
	openvz/RessourceView.js				\
	openvz/Options.js				\
	openvz/Network.js				\
	openvz/DNS.js					\
	openvz/BeanCounterGrid.js				\
	openvz/Config.js				\
	openvz/CreateWizard.js				\
	storage/ContentView.js				\
	storage/StatusView.js				\
	storage/Summary.js				\
	storage/Browser.js				\
	storage/DirEdit.js				\
	storage/NFSEdit.js				\
	storage/IScsiEdit.js				\
	storage/LVMEdit.js				\
	dc/OptionView.js				\
	dc/StorageView.js				\
	dc/UserEdit.js					\
	dc/UserView.js					\
	dc/GroupView.js					\
	dc/GroupEdit.js					\
	dc/RoleView.js					\
	dc/ACLView.js					\
	dc/AuthView.js					\
	dc/AuthEdit.js					\
	dc/Backup.js					\
	dc/Config.js					\
	Workspace.js

lint: ${JSSRC}
	jslint ${JSSRC} 

pvemanagerlib.js: ${JSSRC}
	cat ${JSSRC} >$@.tmp
	mv $@.tmp $@

all: pvemanagerlib.js

.PHONY: install 
install: pvemanagerlib.js startup.pl index.pl
	install -d ${WWWBASEDIR}
	install -m 0755 -o www-data -g www-data startup.pl ${WWWBASEDIR}
	install -d ${WWWROOTDIR}
	install -m 0755 -o www-data -g www-data index.pl ${WWWROOTDIR}
	install -d ${WWWEXT4DIR}
	install -m 0644 -o www-data -g www-data pvemanagerlib.js ${WWWEXT4DIR}

.PHONY: distclean
distclean: clean

.PHONY: clean
clean:
	find . -name '*~' -exec rm {} ';'	
	rm -rf pvemanagerlib.js



