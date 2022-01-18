Ext.define('PVE.qemu.PCIInputPanel', {
    extend: 'Proxmox.panel.InputPanel',

    onlineHelp: 'qm_pci_passthrough_vm_config',

    setVMConfig: function(vmconfig) {
	var me = this;
	me.vmconfig = vmconfig;

	var hostpci = me.vmconfig[me.confid] || '';

	var values = PVE.Parser.parsePropertyString(hostpci, 'host');
	if (values.host) {
	    if (!values.host.match(/^[0-9a-f]{4}:/i)) { // add optional domain
		values.host = "0000:" + values.host;
	    }
	    if (values.host.length < 11) { // 0000:00:00 format not 0000:00:00.0
		values.host += ".0";
		values.multifunction = true;
	    }
	}

	values['x-vga'] = PVE.Parser.parseBoolean(values['x-vga'], 0);
	values.pcie = PVE.Parser.parseBoolean(values.pcie, 0);
	values.rombar = PVE.Parser.parseBoolean(values.rombar, 1);

	me.setValues(values);
	if (!me.vmconfig.machine || me.vmconfig.machine.indexOf('q35') === -1) {
	    // machine is not set to some variant of q35, so we disable pcie
	    var pcie = me.down('field[name=pcie]');
	    pcie.setDisabled(true);
	    pcie.setBoxLabel(gettext('Q35 only'));
	}

	if (values.romfile) {
	    me.down('field[name=romfile]').setVisible(true);
	}
    },

    onGetValues: function(values) {
	let me = this;
	if (!me.confid) {
	    for (let i = 0; i < 5; i++) {
		if (!me.vmconfig['hostpci' + i.toString()]) {
		    me.confid = 'hostpci' + i.toString();
		    break;
		}
	    }
	    // FIXME: what if no confid was found??
	}
	values.host.replace(/^0000:/, ''); // remove optional '0000' domain

	if (values.multifunction) {
	    values.host = values.host.substring(0, values.host.indexOf('.')); // skip the '.X'
	    delete values.multifunction;
	}

	if (values.rombar) {
	    delete values.rombar;
	} else {
	    values.rombar = 0;
	}

	if (!values.romfile) {
	    delete values.romfile;
	}

	let ret = {};
	ret[me.confid] = PVE.Parser.printPropertyString(values, 'host');
	return ret;
    },

    initComponent: function() {
	let me = this;

	me.nodename = me.pveSelNode.data.node;
	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.column1 = [
	    {
		xtype: 'pvePCISelector',
		fieldLabel: gettext('Device'),
		name: 'host',
		nodename: me.nodename,
		allowBlank: false,
		onLoadCallBack: function(store, records, success) {
		    if (!success || !records.length) {
			return;
		    }
		    if (records.every((val) => val.data.iommugroup === -1)) { // no IOMMU groups
			let warning = Ext.create('Ext.form.field.Display', {
			    columnWidth: 1,
			    padding: '0 0 10 0',
			    value: 'No IOMMU detected, please activate it.' +
				   'See Documentation for further information.',
			    userCls: 'pmx-hint',
			});
			me.items.insert(0, warning);
			me.updateLayout(); // insert does not trigger that
		    }
		},
		listeners: {
		    change: function(pcisel, value) {
			if (!value) {
			    return;
			}
			let pciDev = pcisel.getStore().getById(value);
			let mdevfield = me.down('field[name=mdev]');
			mdevfield.setDisabled(!pciDev || !pciDev.data.mdev);
			if (!pciDev) {
			    return;
			}
			if (pciDev.data.mdev) {
			    mdevfield.setPciID(value);
			}
			let iommu = pciDev.data.iommugroup;
			if (iommu === -1) {
			    return;
			}
			// try to find out if there are more devices in that iommu group
			let id = pciDev.data.id.substring(0, 5); // 00:00
			let count = 0;
			pcisel.getStore().each(({ data }) => {
			    if (data.iommugroup === iommu && data.id.substring(0, 5) !== id) {
				count++;
				return false;
			    }
			    return true;
			});
			let warning = me.down('#iommuwarning');
			if (count && !warning) {
			    warning = Ext.create('Ext.form.field.Display', {
				columnWidth: 1,
				padding: '0 0 10 0',
				itemId: 'iommuwarning',
				value: 'The selected Device is not in a seperate IOMMU group, make sure this is intended.',
				userCls: 'pmx-hint',
			    });
			    me.items.insert(0, warning);
			    me.updateLayout(); // insert does not trigger that
			} else if (!count && warning) {
			    me.remove(warning);
			}
		    },
		},
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('All Functions'),
		name: 'multifunction',
	    },
	];

	me.column2 = [
	    {
		xtype: 'pveMDevSelector',
		name: 'mdev',
		disabled: true,
		fieldLabel: gettext('MDev Type'),
		nodename: me.nodename,
		listeners: {
		    change: function(field, value) {
			let multiFunction = me.down('field[name=multifunction]');
			if (value) {
			    multiFunction.setValue(false);
			}
			multiFunction.setDisabled(!!value);
		    },
		},
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Primary GPU'),
		name: 'x-vga',
	    },
	];

	me.advancedColumn1 = [
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: 'ROM-Bar',
		name: 'rombar',
	    },
	    {
		xtype: 'displayfield',
		submitValue: true,
		hidden: true,
		fieldLabel: 'ROM-File',
		name: 'romfile',
	    },
	    {
		xtype: 'textfield',
		name: 'vendor-id',
		fieldLabel: gettext('Set vendor ID'),
		vtype: 'PciId',
		allowBlank: true,
		emptyText: Proxmox.Utils.defaultText,
		submitEmpty: false,
	    },
	    {
		xtype: 'textfield',
		name: 'device-id',
		fieldLabel: gettext('Set device ID'),
		vtype: 'PciId',
		allowBlank: true,
		emptyText: Proxmox.Utils.defaultText,
		submitEmpty: false,
	    },
	];

	me.advancedColumn2 = [
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: 'PCI-Express',
		name: 'pcie',
	    },
	    {
		xtype: 'textfield',
		name: 'sub-vendor-id',
		fieldLabel: gettext('Set sub-vendor ID'),
		vtype: 'PciId',
		allowBlank: true,
		emptyText: Proxmox.Utils.defaultText,
		submitEmpty: false,
	    },
	    {
		xtype: 'textfield',
		name: 'sub-device-id',
		fieldLabel: gettext('Set sub-device ID'),
		vtype: 'PciId',
		allowBlank: true,
		emptyText: Proxmox.Utils.defaultText,
		submitEmpty: false,
	    },
	];

	me.callParent();
    },
});

Ext.define('PVE.qemu.PCIEdit', {
    extend: 'Proxmox.window.Edit',

    subject: gettext('PCI Device'),

    vmconfig: undefined,
    isAdd: true,

    initComponent: function() {
	let me = this;

	me.isCreate = !me.confid;

	let ipanel = Ext.create('PVE.qemu.PCIInputPanel', {
	    confid: me.confid,
	    pveSelNode: me.pveSelNode,
	});

	Ext.apply(me, {
	    items: [ipanel],
	});

	me.callParent();

	me.load({
	    success: ({ result }) => ipanel.setVMConfig(result.data),
	});
    },
});
