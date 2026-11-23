// The storage types and setups of Datacenter > Storage > Add, grouped and searchable, as the first
// step of the Add Storage wizard. A selection mounts the steps of the entry; a double click, Enter
// on an entry or Enter in the search with a single match goes on to them.
Ext.define('PVE.storage.TypeList', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveStorageTypeList',

    layout: 'fit',
    border: false,

    // [{ id, text, note }] in the order they show
    categories: [],
    // returns [{ id, category, text, description, keywords, iconCls, disabledReason }]
    getActions: () => [],

    loadActions: function () {
        let me = this;
        let categories = me.categories;
        let order = Object.fromEntries(categories.map((category, i) => [category.id, i]));
        let actions = me.getActions();
        // one reason for all entries, such as a missing privilege, shows once above the list
        let reasons = new Set(actions.map((action) => action.disabledReason));
        me.sharedReason = reasons.size === 1 ? [...reasons][0] : undefined;
        let notice = me.down('#sharedReason');
        notice.setHtml(
            me.sharedReason
                ? `<i class="fa fa-fw fa-lock"></i> ${Ext.htmlEncode(me.sharedReason)}`
                : '',
        );
        notice.setHidden(!me.sharedReason);
        let selected = me.grid.getSelection()[0]?.get('id');
        me.store.setData(
            actions.map((action, i) => {
                let group = order[action.category] ?? order.other;
                return {
                    ...action,
                    // the category is found by its name too
                    keywords: `${action.keywords} ${categories[group].text}`,
                    group,
                    order: i,
                };
            }),
        );
        let rec = selected && me.store.getById(selected);
        if (rec) {
            me.grid.getSelectionModel().select(rec, false, true);
        }
    },

    applyFilter: function (value) {
        let me = this;
        let words = (value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) {
            me.store.clearFilter();
            return;
        }
        let text = (rec) =>
            [rec.get('text'), rec.get('description'), rec.get('keywords')].join(' ').toLowerCase();
        me.store.clearFilter(true);
        me.store.filterBy((rec) => words.every((word) => text(rec).includes(word)));
        // Next must not go on to an entry that the search hides
        let selected = me.grid.getSelection()[0];
        if (selected && me.store.indexOf(selected) === -1) {
            me.grid.getSelectionModel().deselectAll();
        }
    },

    // the ID of the selected entry, if it is shown and can be used
    selectedId: function () {
        let me = this;
        let rec = me.grid.getSelection()[0];
        return rec && me.store.indexOf(rec) !== -1 && !rec.get('disabledReason')
            ? rec.get('id')
            : undefined;
    },

    // Selects an entry and goes on to its steps.
    choose: function (rec) {
        let me = this;
        if (!rec || rec.get('disabledReason')) {
            return;
        }
        me.grid.getSelectionModel().select(rec);
        me.fireEvent('choose', me, rec.get('id'));
    },

    focusSearch: function () {
        this.down('#search').focus();
    },

    // applies a search that still waits for its delay
    flushSearch: function () {
        this.applyFilter(this.down('#search').getValue());
    },

    initComponent: function () {
        let me = this;

        let categories = me.categories;
        me.store = Ext.create('Ext.data.Store', {
            autoDestroy: true,
            fields: [
                'id',
                'text',
                'description',
                'keywords',
                'iconCls',
                'disabledReason',
                { name: 'group', type: 'int' },
                { name: 'order', type: 'int' },
            ],
            groupField: 'group',
            sorters: ['order'],
        });

        me.grid = Ext.create('Ext.grid.Panel', {
            store: me.store,
            hideHeaders: true,
            border: false,
            scrollable: 'y',
            features: [
                {
                    ftype: 'grouping',
                    collapsible: false,
                    enableGroupingMenu: false,
                    groupHeaderTpl: [
                        '{[this.header(values.groupValue)]}',
                        {
                            header: function (group) {
                                let { text, note } = categories[group];
                                return (
                                    Ext.htmlEncode(text) +
                                    (note
                                        ? ` <span style="font-weight: normal">- ${Ext.htmlEncode(note)}</span>`
                                        : '')
                                );
                            },
                        },
                    ],
                },
            ],
            viewConfig: {
                deferEmptyText: false,
                emptyText: gettext('No storage type matches the search.'),
            },
            columns: [
                {
                    dataIndex: 'text',
                    width: 280,
                    cellWrap: true,
                    renderer: function (value, metaData, rec) {
                        metaData.tdStyle = rec.get('disabledReason')
                            ? 'opacity: 0.6'
                            : 'cursor: pointer';
                        let icon = rec.get('iconCls');
                        return `<i class="${icon}"></i> ${Ext.htmlEncode(value)}`;
                    },
                },
                {
                    dataIndex: 'description',
                    flex: 1,
                    cellWrap: true,
                    renderer: function (value, metaData, rec) {
                        let reason = rec.get('disabledReason');
                        if (!reason) {
                            metaData.tdStyle = 'cursor: pointer';
                            return Ext.htmlEncode(value);
                        }
                        metaData.tdStyle = 'opacity: 0.6';
                        if (me.sharedReason) {
                            return Ext.htmlEncode(value);
                        }
                        return (
                            (value ? `${Ext.htmlEncode(value)}<br>` : '') +
                            `<i class="fa fa-fw fa-lock"></i> ${Ext.htmlEncode(reason)}`
                        );
                    },
                },
            ],
            listeners: {
                beforeselect: (sm, rec) => !rec.get('disabledReason'),
                selectionchange: (sm, selection) =>
                    me.fireEvent('select', me, selection[0]?.get('id')),
                itemdblclick: (view, rec) => me.choose(rec),
                itemkeydown: (view, rec, item, index, event) => {
                    if (event.getKey() === event.ENTER) {
                        event.stopEvent();
                        me.choose(rec);
                    } else if (event.getKey() === event.UP && index === 0) {
                        event.stopEvent();
                        me.focusSearch();
                    }
                },
            },
        });

        let search = Ext.create('Ext.form.field.Text', {
            itemId: 'search',
            emptyText: gettext('Search storage type'),
            // not a value of the storage
            submitValue: false,
            isFormField: false,
            enableKeyEvents: true,
            listeners: {
                change: {
                    buffer: 150,
                    fn: (field, value) => me.applyFilter(value),
                },
                specialkey: (field, event) => {
                    let key = event.getKey();
                    if (key !== event.DOWN && key !== event.ENTER) {
                        return;
                    }
                    event.stopEvent();
                    // the search may still be buffered
                    me.applyFilter(field.getValue());
                    let grid = me.grid;
                    if (key === event.DOWN && me.store.getCount()) {
                        grid.getView().focusRow(me.store.getAt(0));
                        grid.getSelectionModel().select(0);
                    } else if (key === event.ENTER) {
                        let enabled = me.store.getRange().filter((r) => !r.get('disabledReason'));
                        // an entry whose name has all words beats one found by its description
                        let words = field.getValue().toLowerCase().split(/\s+/).filter(Boolean);
                        let named = enabled.filter((r) =>
                            words.every((word) => r.get('text').toLowerCase().includes(word)),
                        );
                        // and one with just that name beats others that contain it
                        let exact = enabled.filter(
                            (r) => r.get('text').toLowerCase() === words.join(' '),
                        );
                        let only =
                            enabled.length === 1
                                ? enabled[0]
                                : named.length === 1
                                  ? named[0]
                                  : exact.length === 1 && exact[0];
                        if (only) {
                            me.choose(only);
                        } else if (enabled.length) {
                            let first = named[0] ?? enabled[0];
                            grid.getView().focusRow(first);
                            grid.getSelectionModel().select(first);
                        }
                    }
                },
            },
        });

        me.items = [me.grid];
        me.dockedItems = [
            {
                xtype: 'toolbar',
                dock: 'top',
                layout: { type: 'vbox', align: 'stretch' },
                items: [search, { xtype: 'component', itemId: 'sharedReason', hidden: true }],
            },
        ];

        me.callParent();
        me.loadActions();
    },
});

// Datacenter > Storage > Add: one window from the choice of the storage type or setup to its
// creation. A plain type shows the input panels of its Edit dialog, a guided SAN setup its steps.
Ext.define('PVE.storage.AddWizard', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveStorageAddWizard',

    modal: true,
    border: false,
    draggable: true,
    closable: true,
    resizable: false,
    layout: 'border',

    // the storage view whose addActions() list the entries and that knows the custom plugins
    storageView: undefined,
    // the ID of an entry to open without the list of types, like 'setup:iscsi'
    preselect: undefined,
    reloadCallback: undefined,

    referenceHolder: true,
    defaultButton: 'submitbutton',

    statics: {
        // the methods of a guided setup that its steps call on their window
        sanMethods: [
            'stopWithError',
            'showError',
            'waitForTask',
            'volumeSettings',
            'cleanUp',
            'addStorage',
            'addLVMStorage',
            'multipathSummary',
            'updateSummary',
            'finish',
            'followId',
            'createSteps',
            'createStorage',
        ],
        sanClasses: {
            iscsi: 'PVE.storage.wizard.IScsi',
            nvmeof: 'PVE.storage.wizard.NVMeOF',
            fc: 'PVE.storage.wizard.FibreChannel',
        },
    },

    getCategories: function () {
        return this.storageView.addCategories.map((category) => ({ ...category }));
    },

    // the editor of a plain type, as Datacenter > Storage > Edit opens it
    plainEditor: function (type) {
        let me = this;
        let schema = PVE.Utils.storageSchema[type];
        if (schema?.ipanel) {
            return { paneltype: `PVE.storage.${schema.ipanel}`, canDoBackups: schema.backups };
        }
        let metadata = me.storageView?.pluginMetadata?.[type];
        if (metadata?.origin === 'custom') {
            return {
                paneltype: 'PVE.storage.CustomInputPanel',
                metadata,
                // the retention panel submits 'prune-backups'
                canDoBackups:
                    metadata.content.supported.includes('backup') &&
                    Object.hasOwn(metadata.schema, 'prune-backups'),
            };
        }
        return undefined;
    },

    createPlainFlow: function (type) {
        let me = this;
        let editor = me.plainEditor(type);
        if (!editor) {
            Ext.Msg.alert(
                gettext('Error'),
                Ext.String.format(
                    gettext("No editor registered for storage type '{0}'"),
                    Ext.htmlEncode(type),
                ),
            );
            return undefined;
        }
        // the panels fill the window, as the steps of a setup do
        let padding = 10;
        // a step taller than the window, like the form of a custom plugin, scrolls
        let ipanel = Ext.create(editor.paneltype, {
            title: gettext('General'),
            type,
            isCreate: true,
            metadata: editor.metadata,
            padding,
            scrollable: 'y',
        });
        let items = [ipanel];
        if (editor.canDoBackups) {
            items.push({
                xtype: 'pveBackupJobPrunePanel',
                title: gettext('Backup Retention'),
                // custom plugins do not necessarily support it
                hasMaxProtected:
                    !editor.metadata ||
                    Object.hasOwn(editor.metadata.schema, 'max-protected-backups'),
                isCreate: true,
                keepAllDefaultForCreate: true,
                showPBSHint: ipanel.isPBS,
                fallbackHintHtml: gettext(
                    "Without any keep option, the node's vzdump.conf or `keep-all` is used as fallback for backup jobs",
                ),
                padding,
                scrollable: 'y',
            });
        }
        for (const panel of ipanel.extraTabs ?? []) {
            items.push({ ...panel, isCreate: true, padding, scrollable: 'y' });
        }
        return {
            kind: 'plain',
            subject: Ext.htmlEncode(
                editor.metadata?.['display-name'] || PVE.Utils.format_storage_type(type),
            ),
            items,
            ipanel,
        };
    },

    createSanFlow: function (type) {
        let me = this;
        let proto = Ext.ClassManager.get(PVE.storage.AddWizard.sanClasses[type]).prototype;
        for (const name of PVE.storage.AddWizard.sanMethods) {
            me[name] = proto[name];
        }
        Ext.apply(me, {
            wizardType: type,
            connection: undefined,
            storageAdded: false,
            writing: false,
            addedEntry: undefined,
        });
        // the steps set the title of a setup window, which this window sets itself once mounted
        let title = me.title;
        let items = me.createSteps();
        me.title = title;
        return {
            kind: 'san',
            target: type !== 'fc',
            subject: PVE.storage.wizard.SAN.subject(type),
            items,
        };
    },

    unmountFlow: function () {
        let me = this;
        let flow = me.flow;
        if (!flow) {
            return;
        }
        let tp = me.down('#wizcontent');
        for (const tab of me.flowTabs()) {
            tp.remove(tab, true);
        }
        if (flow.kind === 'san') {
            // the type list cannot be reached while the setup has a storage it added
            if (me.connection?.created && !me.storageAdded) {
                PVE.storage.wizard.SAN.removeAddedConnection(me.connection, Ext.emptyFn);
            }
            for (const name of PVE.storage.AddWizard.sanMethods) {
                delete me[name];
            }
            Ext.apply(me, { wizardType: undefined, connection: undefined, addedEntry: undefined });
        }
        me.flow = undefined;
        me.setTitle(gettext('Add Storage'));
    },

    // Mounts the steps of an entry after the type list, in place of those of another entry.
    mountFlow: function (id) {
        let me = this;
        if (me.flow?.id === id) {
            return true;
        }
        me.unmountFlow();
        if (!id) {
            me.updateButtons();
            return false;
        }
        let [kind, type] = id.split(':');
        let flow;
        if (kind === 'type') {
            flow = me.createPlainFlow(type);
        } else if (kind === 'setup') {
            flow = me.createSanFlow(type);
        }
        if (!flow) {
            me.updateButtons();
            return false;
        }
        flow.id = id;
        me.flow = flow;
        me.maxidx = me.typeTab ? 0 : -1;
        let tp = me.down('#wizcontent');
        let added = [].concat(tp.add(flow.items));
        let advanced = me.down('#advanced').getValue();
        for (const tab of added) {
            tab.disable();
            let panels = tab.isXType('inputpanel') ? [tab] : [];
            panels.push(...tab.query('inputpanel'));
            panels.forEach((panel) => panel.setAdvancedVisible(advanced));
            for (const field of tab.query('field')) {
                field.on('change', me.updateButtons, me);
                field.on('validitychange', me.updateButtons, me);
            }
        }
        if (!me.typeTab) {
            added[0].enable();
            tp.setActiveTab(added[0]);
        }
        me.setTitle(Proxmox.Utils.dialog_title(flow.subject, true, true));
        me.updateButtons();
        return true;
    },

    flowTabs: function () {
        let me = this;
        return me
            .down('#wizcontent')
            .items.getRange()
            .filter((tab) => tab !== me.typeTab);
    },

    checkCard: function (card) {
        let me = this;
        if (card === me.typeTab) {
            return !!me.typeTab.selectedId();
        }
        let fields = card.query('field, fieldcontainer');
        if (card.isXType('fieldcontainer')) {
            fields.unshift(card);
        }
        let valid = true;
        for (const field of fields) {
            if (Ext.isFunction(field.isValid) && !field.isValid()) {
                valid = false;
            }
        }
        if (Ext.isFunction(card.validator)) {
            return card.validator();
        }
        return valid;
    },

    // Sets the buttons and which steps can be opened, after a change of a field or the step.
    updateButtons: function () {
        let me = this;
        let tp = me.down('#wizcontent');
        let active = tp?.getActiveTab();
        if (!active || me.destroyed) {
            return;
        }
        let tabs = tp.items.getRange();
        let idx = tabs.indexOf(active);
        let flow = me.flow;
        let back = me.down('#back');
        let next = me.down('#next');
        let submit = me.down('#submit');
        let valid = me.checkCard(active);

        // a setup that added its connection storage keeps it until it is closed
        if (me.typeTab) {
            me.typeTab.setDisabled(!!me.connection);
        }
        if (flow?.kind === 'plain') {
            // the retention and encryption tabs have defaults, so all can be opened at once
            let flowTabs = me.flowTabs();
            // before the check, as the fields of a disabled tab count as valid
            if (me.typeTab) {
                flowTabs[0].enable();
            }
            let generalValid = me.checkCard(flowTabs[0]);
            flowTabs.slice(1).forEach((tab) => tab.setDisabled(!generalValid));
        } else {
            // enable the step after a valid one, but not after a step that submits something
            for (let i = idx; i <= me.maxidx && i < tabs.length - 1; i++) {
                let ok = i === idx ? valid : me.checkCard(tabs[i]);
                if (!ok) {
                    tabs.slice(i + 1).forEach((tab) => tab.disable());
                    break;
                }
                if (tabs[i].onSubmit) {
                    break;
                }
                tabs[i + 1].enable();
            }
        }

        let first = me.typeTab ? 1 : 0;
        let backDisabled =
            idx === 0 ||
            (idx === first && !!me.connection) ||
            (flow?.kind === 'san' && flow.target && active.itemId === 'luns');
        back.setDisabled(backDisabled);

        if (active === me.typeTab) {
            next.show();
            // a setup closed by going back mounts again on Next, without a new selection
            next.setDisabled(!me.typeTab.selectedId());
            submit.hide();
        } else if (flow.kind === 'plain') {
            // as in other wizards, the button that goes on stays in place and adds only at the end
            let last = idx === tabs.length - 1;
            next.setVisible(!last);
            next.setDisabled(!valid);
            submit.setVisible(last);
            submit.setText(gettext('Add'));
            submit.setDisabled(!me.flowTabs().every((tab) => me.checkCard(tab)));
        } else {
            let submits = !!active.onSubmit;
            next.setVisible(!submits);
            next.setDisabled(!valid);
            submit.setVisible(submits);
            submit.setDisabled(!valid);
            submit.setText(active.itemId === 'target' ? gettext('Next') : gettext('Finish'));
        }
    },

    // A tab of the steps leads away from the type list only to the steps of the entry selected
    // there, also with a search or a selection that still waits for its delay.
    onBeforeTabChange: function (newcard, oldcard) {
        let me = this;
        if (!me.typeTab || oldcard !== me.typeTab || newcard === me.typeTab) {
            return true;
        }
        me.typeTab.flushSearch();
        let id = me.typeTab.selectedId();
        return id !== undefined && id === me.flow?.id;
    },

    onTabChange: function (tp, newcard) {
        let me = this;
        me.tabChangedAt = Date.now();
        let idx = tp.items.indexOf(newcard);
        me.maxidx = Math.max(me.maxidx ?? 0, idx);
        if (newcard === me.typeTab) {
            // a setup polls and discovers in its steps; Next mounts it again from the selection
            if (me.flow?.kind === 'san' && !me.connection) {
                me.unmountFlow();
            }
            Ext.GlobalEvents.fireEvent('proxmoxShowHelp', 'chapter_storage');
            me.typeTab.focusSearch();
        }
        me.updateButtons();
    },

    goNext: function () {
        let me = this;
        let tp = me.down('#wizcontent');
        let active = tp.getActiveTab();
        if (active === me.typeTab) {
            // a search typed just before must not leave a hidden entry selected
            me.typeTab.flushSearch();
        }
        if (!me.checkCard(active)) {
            return;
        }
        if (active === me.typeTab && !me.mountFlow(me.typeTab.selectedId())) {
            return;
        }
        let ntab = tp.items.getAt(tp.items.indexOf(active) + 1);
        if (ntab) {
            ntab.enable();
            tp.setActiveTab(ntab);
            ntab.down('field:focusable[disabled=false][hidden=false]')?.focus();
        }
    },

    submitPlain: function () {
        let me = this;
        if (me.submitting) {
            return;
        }
        // A field reports a change only after a short delay, so Add can still be enabled for a
        // value pasted right before, without its check or the reaction of the form to it, like
        // NFS clearing the export of the previous server.
        me.down('form')
            .getForm()
            .getFields()
            .each((field) => field.checkChange?.());
        let invalid = me.flowTabs().find((tab) => !me.checkCard(tab));
        if (invalid) {
            me.down('#wizcontent').setActiveTab(invalid);
            return;
        }
        let form = me.down('form').getForm();
        let values = {};
        for (const tab of me.flowTabs()) {
            let panels = tab.isXType('inputpanel') ? [tab] : [];
            panels.push(...tab.query('inputpanel'));
            panels.forEach((panel) => Proxmox.Utils.assemble_field_data(values, panel.getValues()));
        }
        Ext.Object.each(values, (name, value) => {
            if (Ext.isArray(value) && !value.length) {
                values[name] = '';
            }
        });
        let ipanel = me.flow.ipanel;
        let done = (success, response, options) => {
            if (typeof ipanel.apiCallDone === 'function') {
                ipanel.apiCallDone(success, response, options);
            }
        };
        // the window stays until the answer, which can carry a generated key of PBS
        me.submitting = true;
        Proxmox.Utils.API2Request({
            url: '/storage',
            method: 'POST',
            params: values,
            waitMsgTarget: me,
            failure: function (response, options) {
                me.submitting = false;
                done(false, response, options);
                let errors = response.result?.errors;
                if (errors) {
                    // show the first step with an error before marking it, as showing a step
                    // validates its fields, which clears the marks of locally valid values
                    let tab = me
                        .flowTabs()
                        .find((card) =>
                            card.query('field').some((f) => Object.hasOwn(errors, f.getName?.())),
                        );
                    if (tab) {
                        me.down('#wizcontent').setActiveTab(tab);
                    }
                    form.markInvalid(errors);
                }
                // A field that loses the focus to the message, as after Enter in it, validates
                // itself again and so drops the mark of a locally valid value: mark once more.
                Ext.Msg.alert(gettext('Error'), response.htmlStatus, () => {
                    if (errors && !me.destroyed) {
                        form.markInvalid(errors);
                    }
                });
            },
            success: function (response, options) {
                me.submitting = false;
                done(true, response, options);
                me.added = true;
                me.close();
            },
        });
    },

    initComponent: function () {
        let me = this;

        if (!me.storageView && !me.preselect?.startsWith('setup:')) {
            throw 'no storage view given';
        }

        let viewSize = Ext.getBody().getViewSize();
        me.width = Math.min(960, viewSize.width - 40);
        // the whole list of types fits, if the screen allows
        me.height = Math.min(760, viewSize.height - 40);
        me.title = gettext('Add Storage');

        let tabs = [];
        if (!me.preselect) {
            tabs.push({
                xtype: 'pveStorageTypeList',
                title: gettext('Type'),
                itemId: 'typeTab',
                padding: 0,
                categories: me.getCategories(),
                getActions: () => me.storageView.addActions(),
                listeners: {
                    select: {
                        // Arrows through the list do not mount every entry on the way. A selection
                        // that a delayed search drops does not take the steps away once they show.
                        buffer: 150,
                        fn: (list) => {
                            if (me.down('#wizcontent').getActiveTab() === list) {
                                me.mountFlow(list.selectedId());
                            }
                        },
                    },
                    choose: (list, id) => {
                        if (me.mountFlow(id)) {
                            me.goNext();
                        }
                    },
                },
            });
        }

        let sp = Ext.state.Manager.getProvider();
        let advancedOn = sp.get('proxmox-advanced-cb');

        Ext.apply(me, {
            items: [
                {
                    xtype: 'form',
                    region: 'center',
                    layout: 'fit',
                    border: false,
                    fieldDefaults: {
                        labelWidth: 100,
                        anchor: '100%',
                    },
                    items: [
                        {
                            itemId: 'wizcontent',
                            xtype: 'tabpanel',
                            activeItem: 0,
                            bodyPadding: 0,
                            defaults: { padding: 10 },
                            items: tabs,
                            listeners: {
                                afterrender: (tp) => me.onTabChange(tp, tp.getActiveTab()),
                                beforetabchange: (tp, newcard, oldcard) =>
                                    me.onBeforeTabChange(newcard, oldcard),
                                tabchange: (tp, newcard) => me.onTabChange(tp, newcard),
                            },
                        },
                    ],
                    listeners: {
                        validitychange: () => me.updateButtons(),
                        fieldvaliditychange: () => me.updateButtons(),
                    },
                },
            ],
            fbar: [
                { xtype: 'proxmoxHelpButton', itemId: 'help' },
                '->',
                {
                    xtype: 'proxmoxcheckbox',
                    itemId: 'advanced',
                    boxLabelAlign: 'before',
                    boxLabel: gettext('Advanced'),
                    value: advancedOn,
                    // not a value of the storage
                    submitValue: false,
                    isFormField: false,
                    listeners: {
                        change: function (_, value) {
                            me.down('#wizcontent')
                                .query('inputpanel')
                                .forEach((ip) => ip.setAdvancedVisible(value));
                            sp.set('proxmox-advanced-cb', value);
                        },
                    },
                },
                {
                    text: gettext('Back'),
                    itemId: 'back',
                    disabled: true,
                    minWidth: 60,
                    handler: function () {
                        let tp = me.down('#wizcontent');
                        let prev = tp.items.getAt(tp.items.indexOf(tp.getActiveTab()) - 1);
                        if (prev) {
                            tp.setActiveTab(prev);
                        }
                    },
                },
                {
                    text: gettext('Next'),
                    itemId: 'next',
                    disabled: true,
                    minWidth: 60,
                    handler: () => me.goNext(),
                },
                {
                    text: gettext('Finish'),
                    itemId: 'submit',
                    reference: 'submitbutton',
                    hidden: true,
                    minWidth: 60,
                    // Enter in a field of a plain type goes on like the visible button; not for
                    // the type list or a setup, which go on with their buttons only
                    click: function (event) {
                        let active = me.down('#wizcontent').getActiveTab();
                        if (me.flow?.kind !== 'plain' || active === me.typeTab) {
                            return;
                        }
                        // a held key must not go on and then add, and an open picker, like the
                        // grid of the node selector, needs Enter for its own selection
                        if (event?.browserEvent?.repeat || Ext.Component.from(event)?.isExpanded) {
                            return;
                        }
                        let next = me.down('#next');
                        if (next.isVisible() && !next.isDisabled()) {
                            me.goNext();
                        } else if (this.isVisible() && !this.isDisabled()) {
                            me.submitPlain();
                        }
                    },
                    handler: function () {
                        // it takes the place of Next on the last step, where the second click of
                        // a double click on Next must not add
                        if (Date.now() - (me.tabChangedAt ?? 0) < 500) {
                            return;
                        }
                        if (me.flow?.kind === 'plain') {
                            me.submitPlain();
                        } else {
                            me.down('#wizcontent').getActiveTab().onSubmit();
                        }
                    },
                },
            ],
        });

        me.callParent();

        me.typeTab = me.down('#typeTab');
        if (me.typeTab) {
            // custom plugins can arrive after the wizard opened
            me.mon(me.storageView, 'addactionschange', () => me.typeTab.loadActions());
        }
        if (me.preselect) {
            me.mountFlow(me.preselect);
        }

        me.on('beforeclose', () => !me.submitting);
        me.on('destroy', () => {
            if (me.flow?.kind === 'san') {
                // a running request of the setup cleans up once it is done
                if (!me.writing) {
                    me.cleanUp();
                }
            } else if (me.added) {
                me.reloadCallback?.();
            }
        });
    },
});
