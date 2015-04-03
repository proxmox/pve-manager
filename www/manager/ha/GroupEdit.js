Ext.define('PVE.ha.GroupInputPanel', {
    extend: 'PVE.panel.InputPanel',

    groupId: undefined,
    
    onGetValues: function(values) {
	var me = this;

	if (me.create) {
	    values.type = 'group';
	}

	return values;
    },

    initComponent : function() {
	var me = this;

	me.column1 = [
	    {
		xtype: me.create ? 'textfield' : 'displayfield',
		name: 'group',
		height: 22, // hack: set same height as text fields
		value: me.groupId || '',
		fieldLabel: 'ID',
		vtype: 'StorageId',
		allowBlank: false
	    },
	    {
		xtype: 'PVE.form.NodeSelector',
		name: 'nodes',
		fieldLabel: gettext('Nodes'),
		allowBlank: false,
		multiSelect: true,
		autoSelect: false
	    }
	];

	me.column2 = [
	    {
		xtype: 'pvecheckbox',
		name: 'restricted',
		uncheckedValue: 0,
		fieldLabel: gettext('restricted')
	    },
	    {
		xtype: 'pvecheckbox',
		name: 'nofailback',
		uncheckedValue: 0,
		fieldLabel: gettext('nofailback')
	    },
	];

	me.columnB = [
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment')
	    }
	];
	
	me.callParent();
    }
});

Ext.define('PVE.ha.GroupEdit', {
    extend: 'PVE.window.Edit',

    groupId: undefined,

    initComponent : function() {
	var me = this;
 
	me.create = !me.groupId;

	if (me.create) {
            me.url = '/api2/extjs/cluster/ha/groups';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/cluster/ha/groups/' + me.groupId;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.ha.GroupInputPanel', {
	    create: me.create,
	    groupId: me.groupId
	});

	Ext.apply(me, {
            subject: gettext('HA Group'),
	    items: [ ipanel ]
	});
	
	me.callParent();

	if (!me.create) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;

		    if (values.nodes) {
			values.nodes = values.nodes.split(',');
		    }

		    ipanel.setValues(values);
		}
	    });
	}
    }
});
